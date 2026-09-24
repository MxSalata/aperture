import { describe, expect, it } from 'vitest';
import { fullSecretName, shortSecretName } from '../wallet';

describe('wallet secret names', () => {
  it('shows the part after the collection, and a name IRIS did not prefix as it is', () => {
    expect(shortSecretName('HL7Interfaces.lab-sftp', 'HL7Interfaces')).toBe('lab-sftp');
    expect(shortSecretName('hl7interfaces.lab-sftp', 'HL7Interfaces')).toBe('lab-sftp');
    expect(shortSecretName('lab-sftp', 'HL7Interfaces')).toBe('lab-sftp');
    expect(shortSecretName(undefined, 'HL7Interfaces')).toBe('');
  });

  it('sends "Collection.Secret" whichever form was typed', () => {
    expect(fullSecretName('HL7Interfaces', 'lab-sftp')).toBe('HL7Interfaces.lab-sftp');
    expect(fullSecretName('HL7Interfaces', ' HL7Interfaces.lab-sftp ')).toBe('HL7Interfaces.lab-sftp');
  });
});
