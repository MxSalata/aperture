"""SQL for Aperture.LogIndex without the caller's SQL privileges.

iris.sql.exec is Dynamic SQL, which checks the caller's privileges on each table, and the package
grants none on its own tables, so an account that holds %Admin_Operate (the only thing the routes
ask for, as %Operator does) but not %All would be refused. The routes check %Admin_Operate
themselves, so these statements are prepared without the check, as %SQL.Statement's
%ExecDirectNoPriv does, and they only ever touch Aperture.LogLine and Aperture.LogIndexFile.

An error is raised as SQLError with its SQLCODE, so a caller can tell a duplicate row (-119, the
unique index) from anything else.
"""


class SQLError(Exception):
    def __init__(self, sqlcode, message):
        super().__init__("SQLCODE %s: %s" % (sqlcode, message))
        self.sqlcode = None if sqlcode is None else int(sqlcode)


DUPLICATE = -119


def rows(sql, *args):
    """The rows `sql` answers, each a list of its columns; a statement with no result answers none."""
    import iris

    statement = iris.cls("%SQL.Statement")._New()
    status = statement._Prepare(sql, 0)
    if iris.cls("%SYSTEM.Status").IsError(status):
        raise SQLError(None, iris.cls("%SYSTEM.Status").GetErrorText(status))
    result = statement._Execute(*args)
    if int(result._SQLCODE or 0) < 0:
        raise SQLError(result._SQLCODE, result._Message)
    columns = result._ResultColumnCount
    out = []
    while columns and result._Next():
        out.append([result._GetData(i) for i in range(1, columns + 1)])
    return out
