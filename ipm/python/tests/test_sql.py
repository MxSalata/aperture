"""aperture_sql against a stand-in for IRIS's iris module (python3 -m unittest discover -s ipm/python/tests)."""

import os
import sys
import types
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), 'lib'))
import aperture_sql  # noqa: E402


class FakeResult:
    def __init__(self, sqlcode, message, data):
        self._SQLCODE, self._Message, self._data = sqlcode, message, list(data)
        self._ResultColumnCount = len(self._data[0]) if self._data else 0
        self._row = None

    def _Next(self):
        if not self._data:
            return 0
        self._row = self._data.pop(0)
        return 1

    def _GetData(self, i):
        return self._row[i - 1]


class FakeStatement:
    calls = []
    answer = FakeResult(0, '', [])

    def _Prepare(self, sql, check_priv):
        FakeStatement.calls.append(('prepare', sql, check_priv))
        return 'bad' if 'SYNTAX' in sql else 1

    def _Execute(self, *args):
        FakeStatement.calls.append(('execute',) + args)
        return FakeStatement.answer


class FakeStatus:
    @staticmethod
    def IsError(status):
        return status == 'bad'

    @staticmethod
    def GetErrorText(status):
        return 'ERROR #5540: SQLCODE: -1'


def fake_cls(name):
    return {'%SQL.Statement': types.SimpleNamespace(_New=FakeStatement), '%SYSTEM.Status': FakeStatus}[name]


class RowsTest(unittest.TestCase):
    def setUp(self):
        sys.modules['iris'] = types.SimpleNamespace(cls=fake_cls)
        FakeStatement.calls = []

    def tearDown(self):
        sys.modules.pop('iris', None)

    def test_prepares_without_the_privilege_check_and_answers_the_rows(self):
        FakeStatement.answer = FakeResult(0, '', [('messages.log', 120), ('alerts.log', 0)])
        rows = aperture_sql.rows('SELECT LogFile, IndexedTo FROM Aperture.LogIndexFile WHERE Lines > ?', 3)
        self.assertEqual(rows, [['messages.log', 120], ['alerts.log', 0]])
        self.assertEqual(FakeStatement.calls[0][2], 0)
        self.assertEqual(FakeStatement.calls[1], ('execute', 3))

    def test_a_statement_without_rows_answers_none(self):
        FakeStatement.answer = FakeResult(100, '', [])
        self.assertEqual(aperture_sql.rows('DELETE FROM Aperture.LogLine WHERE LogFile = ?', 'x'), [])

    def test_errors_carry_their_sqlcode(self):
        FakeStatement.answer = FakeResult(-119, 'UNIQUE or PRIMARY KEY Constraint failed uniqueness check', [])
        with self.assertRaises(aperture_sql.SQLError) as raised:
            aperture_sql.rows('INSERT INTO Aperture.LogLine (LogFile) VALUES (?)', 'x')
        self.assertEqual(raised.exception.sqlcode, aperture_sql.DUPLICATE)
        FakeStatement.answer = FakeResult(-99, 'Privilege violation', [])
        with self.assertRaises(aperture_sql.SQLError) as raised:
            aperture_sql.rows('SELECT 1')
        self.assertEqual(raised.exception.sqlcode, -99)
        with self.assertRaises(aperture_sql.SQLError) as raised:
            aperture_sql.rows('SYNTAX')
        self.assertIsNone(raised.exception.sqlcode)


if __name__ == '__main__':
    unittest.main()
