import { createInterface } from 'node:readline/promises';
import { DEFAULT_BASE, login } from '../moodle/login.ts';

/** Reads a line from the TTY without echoing it. */
async function askHidden(question: string): Promise<string> {
  const stdin = process.stdin;
  process.stderr.write(question);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');
  let value = '';
  return new Promise((resolve, reject) => {
    const done = () => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      process.stderr.write('\n');
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') return (done(), resolve(value));
        if (ch === '\u0003') return (done(), reject(new Error('Cancelado')));
        value = ch === '\u007f' || ch === '\b' ? value.slice(0, -1) : value + ch;
      }
    };
    stdin.on('data', onData);
  });
}

export async function loginCli() {
  if (!process.stdin.isTTY) throw new Error('`login` necesita una terminal interactiva.');
  const base = (process.env.FIUBA_CAMPUS_URL || DEFAULT_BASE).replace(/\/+$/, '');
  console.log(`Campus: ${base}`);
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  const username = (await rl.question('Usuario: ')).trim();
  rl.close();
  const password = await askHidden('Contraseña: ');
  const r = await login(base, username, password);
  console.log(`Listo, ${r.fullname}. Token guardado en ${r.file} (la contraseña no se guarda).`);
  if (r.missing.length)
    console.log(
      `Aviso: el campus no habilita ${r.missing.join(', ')}; esas herramientas van a fallar.`
    );
}
