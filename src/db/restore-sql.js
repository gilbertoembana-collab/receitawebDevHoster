import fs from 'node:fs';
import readline from 'node:readline';

export async function normalizeSqlDump(sourcePath, destinationPath) {
  const lines = readline.createInterface({
    input: fs.createReadStream(sourcePath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });
  const output = fs.createWriteStream(destinationPath, { flags: 'wx', mode: 0o600 });
  let hasSqlStatement = false;
  let inCopyData = false;
  let outputFailure;
  output.on('error', (error) => {
    outputFailure = error;
  });

  try {
    for await (const line of lines) {
      if (line.length > 10 * 1024 * 1024 || line.includes('\0')) {
        throw new Error('O ficheiro não parece ser um dump SQL de texto válido.');
      }
      const trimmed = line.trim();
      if (inCopyData) {
        if (trimmed === '\\.') inCopyData = false;
      } else if (
        trimmed.startsWith('\\')
        && !/^\\(?:restrict\s+[a-zA-Z0-9_+/=-]+|unrestrict\s+[a-zA-Z0-9_+/=-]+|\.)\s*$/.test(trimmed)
      ) {
        throw new Error('O dump contém um comando psql não permitido.');
      } else if (/^\s*(?:BEGIN|START\s+TRANSACTION|COMMIT|END|ROLLBACK|ABORT)\b/i.test(line)) {
        throw new Error('O dump contém comandos de transação incompatíveis com uma restauração segura.');
      }

      const normalizedLine = !inCopyData && /^\s*CREATE\s+SCHEMA\s+(?:"public"|public)(?:\s+AUTHORIZATION\s+[^;]+)?\s*;\s*$/i.test(line)
        ? `-- ${line}`
        : line;
      if (normalizedLine.trim() && !normalizedLine.trim().startsWith('--')) hasSqlStatement = true;
      if (!inCopyData && /^\s*COPY\b.*\bFROM\s+stdin\s*;\s*$/i.test(line)) inCopyData = true;
      await new Promise((resolve, reject) => {
        if (outputFailure) return reject(outputFailure);
        output.write(`${normalizedLine}\n`, (error) => error ? reject(error) : resolve());
      });
    }

    if (!hasSqlStatement) throw new Error('O ficheiro está vazio ou não contém comandos SQL.');
    await new Promise((resolve, reject) => {
      output.once('finish', resolve);
      output.end();
    });
    if (outputFailure) throw outputFailure;
  } catch (error) {
    if (!output.destroyed && !output.writableEnded) {
      await new Promise((resolve) => {
        output.once('finish', resolve);
        output.once('error', resolve);
        output.end();
      });
    }
    throw error;
  } finally {
    lines.close();
  }
}
