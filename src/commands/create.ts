import { readdir, readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Command } from 'commander';
import { bold, green, red, dim, cyan } from '../format.js';

const TEMPLATES = ['http-api', 'llm-agent'] as const;
type TemplateName = (typeof TEMPLATES)[number];

const TEMPLATE_DESCRIPTIONS: Record<TemplateName, string> = {
  'http-api': 'Simple REST API (Hono)',
  'llm-agent': 'LLM-powered agent with streaming (Hono + OpenAI)',
};

/** Resolve the templates directory relative to this file's location. */
function templatesDir(): string {
  const thisFile = fileURLToPath(import.meta.url);
  // In dist/commands/create.js → go up to dist/, then to templates/
  // In src/commands/create.ts → go up to src/, then to ../templates/
  const cliRoot = resolve(dirname(thisFile), '..', '..');
  return join(cliRoot, 'templates');
}

/** Recursively copy a directory, replacing placeholders in file contents. */
async function copyTemplate(
  srcDir: string,
  destDir: string,
  replacements: Record<string, string>,
): Promise<string[]> {
  const created: string[] = [];
  const entries = await readdir(srcDir, { withFileTypes: true });

  await mkdir(destDir, { recursive: true });

  for (const entry of entries) {
    const srcPath = join(srcDir, entry.name);
    const destPath = join(destDir, entry.name);

    if (entry.isDirectory()) {
      const nested = await copyTemplate(srcPath, destPath, replacements);
      created.push(...nested);
    } else {
      let content = await readFile(srcPath, 'utf-8');
      for (const [placeholder, value] of Object.entries(replacements)) {
        content = content.replaceAll(placeholder, value);
      }
      await writeFile(destPath, content, 'utf-8');
      created.push(destPath);
    }
  }

  return created;
}

export function registerCreateCommand(program: Command): void {
  program
    .command('create')
    .argument('[name]', 'Agent project name')
    .option('-t, --template <template>', 'Template to use (http-api, llm-agent)')
    .option('-p, --port <port>', 'Local port', '3000')
    .option('--price <price>', 'Price per request in micro-cents', '5000')
    .description('Scaffold a new ProxyGate agent project')
    .addHelpText(
      'after',
      '\nExamples:\n' +
        '  $ proxygate create\n' +
        '  $ proxygate create my-agent --template http-api\n' +
        '  $ proxygate create my-agent -t llm-agent -p 8080 --price 10000\n\n' +
        'Templates:\n' +
        TEMPLATES.map((t) => `  ${t.padEnd(12)} ${TEMPLATE_DESCRIPTIONS[t]}`).join('\n'),
    )
    .action(
      async (
        nameArg: string | undefined,
        opts: { template?: string; port: string; price: string },
      ) => {
        try {
          // -----------------------------------------------------------------
          // 1. Gather inputs (interactive if flags missing)
          // -----------------------------------------------------------------
          let name = nameArg;
          let template = opts.template as TemplateName | undefined;

          if (!name || !template) {
            const prompts = await import('@inquirer/prompts');

            if (!name) {
              name = await prompts.input({
                message: 'Agent name:',
                default: 'my-agent',
                validate: (v: string) =>
                  /^[a-z0-9][a-z0-9-]*$/.test(v) ||
                  'Use lowercase letters, numbers, and hyphens',
              });
            }

            if (!template) {
              template = (await prompts.select({
                message: 'Template:',
                choices: TEMPLATES.map((t) => ({
                  name: `${t.padEnd(12)} — ${TEMPLATE_DESCRIPTIONS[t]}`,
                  value: t,
                })),
              })) as TemplateName;
            }
          }

          // Validate template
          if (!TEMPLATES.includes(template as TemplateName)) {
            console.error(
              red(`Unknown template: "${template}". Choose: ${TEMPLATES.join(', ')}`),
            );
            process.exit(1);
          }

          // -----------------------------------------------------------------
          // 2. Check target directory doesn't exist
          // -----------------------------------------------------------------
          const targetDir = resolve(name);
          try {
            await access(targetDir);
            console.error(red(`Directory "${name}" already exists.`));
            process.exit(1);
          } catch {
            // Good — directory doesn't exist
          }

          // -----------------------------------------------------------------
          // 3. Copy template with placeholder replacement
          // -----------------------------------------------------------------
          const srcDir = join(templatesDir(), template);
          const replacements: Record<string, string> = {
            '{{name}}': name,
            '{{port}}': opts.port,
            '{{price}}': opts.price,
          };

          const created = await copyTemplate(srcDir, targetDir, replacements);

          // -----------------------------------------------------------------
          // 4. Print result
          // -----------------------------------------------------------------
          console.log();
          console.log(`  ${green('Created')} ${bold(name)}/`);
          console.log();

          // Show file tree (relative to target)
          for (const file of created.sort()) {
            const relative = file.replace(targetDir + '/', '');
            console.log(`    ${dim(relative)}`);
          }

          console.log();
          console.log(`  ${bold('Next steps:')}`);
          console.log(`    ${cyan(`cd ${name}`)}`);
          console.log(`    ${cyan('npm install')}`);
          console.log(`    ${cyan('npm run dev')}              ${dim('# start your server')}`);
          console.log(`    ${cyan('proxygate test')}           ${dim('# validate endpoints')}`);
          console.log(`    ${cyan('proxygate tunnel')}         ${dim('# go live on ProxyGate')}`);
          console.log();
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(red(`Error: ${message}`));
          process.exit(1);
        }
      },
    );
}
