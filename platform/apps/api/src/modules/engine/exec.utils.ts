import { exec } from 'child_process';

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export function execAsync(
  command: string,
  options: { cwd?: string; timeout?: number } = {},
): Promise<ExecResult> {
  return new Promise((resolve) => {
    exec(
      command,
      {
        cwd: options.cwd,
        timeout: options.timeout ?? 60_000,
        maxBuffer: 1024 * 1024,
      },
      (error, stdout, stderr) => {
        resolve({
          stdout: stdout?.toString() ?? '',
          stderr: stderr?.toString() ?? '',
          exitCode: error
            ? (typeof error.code === 'number' ? error.code : (error.killed ? 124 : 1))
            : 0,
        });
      },
    );
  });
}
