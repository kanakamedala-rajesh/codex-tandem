import { copyFile } from 'node:fs/promises';
await copyFile(
  'src/windows-process-reader.ps1',
  'dist/windows-process-reader.ps1',
);
