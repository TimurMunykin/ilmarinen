import { Test } from '@nestjs/testing';
import { ValidationService, ValidationResult } from './validation.service';

// We test by mocking execAsync
jest.mock('./exec.utils', () => ({
  execAsync: jest.fn(),
}));

import { execAsync } from './exec.utils';
const mockedExec = execAsync as jest.MockedFunction<typeof execAsync>;

describe('ValidationService', () => {
  let service: ValidationService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [ValidationService],
    }).compile();

    service = module.get(ValidationService);
  });

  it('should return success when both validations pass', async () => {
    mockedExec.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

    const result = await service.validate('/tmp/app');

    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('should return errors when prisma validate fails', async () => {
    mockedExec
      .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // bun install
      .mockResolvedValueOnce({ stdout: '', stderr: 'Error: missing field', exitCode: 1 }); // prisma validate (returns early)

    const result = await service.validate('/tmp/app');

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('prisma');
  });

  it('should return errors when tsc fails', async () => {
    mockedExec
      .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // bun install
      .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // prisma validate
      .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // prisma generate
      .mockResolvedValueOnce({ stdout: 'error TS2304: Cannot find name', stderr: '', exitCode: 2 }); // tsc

    const result = await service.validate('/tmp/app');

    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain('tsc');
  });

  it('should fail early if bun install fails', async () => {
    mockedExec.mockResolvedValueOnce({ stdout: '', stderr: 'resolve error', exitCode: 1 });

    const result = await service.validate('/tmp/app');

    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain('bun install');
  });
});
