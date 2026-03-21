import type { Command } from 'commander';
import type { CreateJobOptions, InteractionType } from '@proxygate/sdk';
import { getClient } from '../helpers.js';
import { bold, dim, green, yellow, cyan, red, formatTable, formatUsdc, formatWallet } from '../format.js';
import { handleError } from '../errors.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Truncate a string to N chars, adding "..." if truncated. */
function truncate(str: string, n: number): string {
  return str.length > n ? str.slice(0, n - 3) + '...' : str;
}

/** Lazy-load @inquirer/prompts to avoid import overhead for non-interactive use. */
async function loadPrompts(): Promise<typeof import('@inquirer/prompts')> {
  return import('@inquirer/prompts');
}

/** Format a status string with color. */
function colorStatus(status: string): string {
  switch (status) {
    case 'open': return green(status);
    case 'claimed': return cyan(status);
    case 'in_review': return yellow(status);
    case 'disputed': return yellow('DISPUTED');
    case 'completed': return green(status);
    case 'cancelled':
    case 'refunded': return dim(status);
    default: return status;
  }
}

// ---------------------------------------------------------------------------
// Subcommands
// ---------------------------------------------------------------------------

function registerListSubcommand(jobs: Command, program: Command): void {
  jobs
    .command('list')
    .description('List jobs on the bounty board')
    .option('--status <status>', 'Filter by status (open, claimed, in_review, completed, cancelled, refunded)')
    .option('--category <cat>', 'Filter by category')
    .option('--search <text>', 'Search title/description')
    .option('--interaction-type <type>', 'Filter by interaction type (M2M, H2M, M2H)')
    .option('--limit <n>', 'Limit results')
    .option('--table', 'Display in human-readable table format')
    .action(async (opts: { status?: string; category?: string; search?: string; interactionType?: string; limit?: string; table?: boolean }) => {
      const parentOpts = program.opts<{ gateway?: string; keypair?: string; json?: boolean }>();
      try {
        const client = await getClient(parentOpts);
        const result = await client.jobs.list({
          status: opts.status,
          category: opts.category,
          interaction_type: opts.interactionType,
          search: opts.search,
          limit: opts.limit ? parseInt(opts.limit, 10) : undefined,
        });

        if (opts.table) {
          if (result.jobs.length === 0) {
            console.log(dim('No jobs found.'));
            return;
          }

          console.log(bold(`Jobs (${result.total} total)`));
          console.log();

          const headers = ['ID', 'Title', 'Status', 'Reward', 'Poster', 'Created'];
          const rows = result.jobs.map((j) => [
            j.id.slice(0, 8),
            truncate(j.title, 40),
            colorStatus(j.status),
            formatUsdc(j.reward_lamports),
            formatWallet(j.poster_wallet),
            new Date(j.created_at).toLocaleDateString(),
          ]);
          console.log(formatTable(headers, rows));
          return;
        }

        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        handleError(err);
      }
    });
}

function registerGetSubcommand(jobs: Command, program: Command): void {
  jobs
    .command('get <id>')
    .description('Get details for a specific job')
    .option('--table', 'Display in human-readable format')
    .action(async (id: string, opts: { table?: boolean }) => {
      const parentOpts = program.opts<{ gateway?: string; keypair?: string; json?: boolean }>();
      try {
        const client = await getClient(parentOpts);
        const job = await client.jobs.get(id);

        if (opts.table) {
          console.log(bold(job.title));
          console.log();
          console.log(`  ${dim('ID:')}            ${job.id}`);
          console.log(`  ${dim('Status:')}        ${colorStatus(job.status)}`);
          console.log(`  ${dim('Type:')}          ${job.interaction_type}`);
          console.log(`  ${dim('Reward:')}        ${formatUsdc(job.reward_lamports)}`);
          console.log(`  ${dim('Total cost:')}    ${formatUsdc(job.total_cost)}`);
          console.log(`  ${dim('Buyer fee:')}     ${formatUsdc(job.buyer_fee)}`);
          console.log(`  ${dim('Seller fee:')}    ${formatUsdc(job.seller_fee)}`);
          console.log(`  ${dim('Poster:')}        ${job.poster_wallet}`);
          if (job.solver_wallet) console.log(`  ${dim('Solver:')}        ${job.solver_wallet}`);
          if (job.category) console.log(`  ${dim('Category:')}      ${job.category}`);
          if (job.deadline) console.log(`  ${dim('Deadline:')}      ${job.deadline}`);
          console.log(`  ${dim('Rejections:')}    ${job.rejection_count}`);
          if (job.rejection_reason) console.log(`  ${dim('Reject reason:')} ${job.rejection_reason}`);
          console.log(`  ${dim('Created:')}       ${job.created_at}`);
          if (job.claimed_at) console.log(`  ${dim('Claimed:')}       ${job.claimed_at}`);
          if (job.completed_at) console.log(`  ${dim('Completed:')}     ${job.completed_at}`);
          console.log();
          console.log(dim('Description:'));
          console.log(job.description);

          if (job.submission) {
            console.log();
            console.log(bold('Submission'));
            console.log(`  ${dim('ID:')}            ${job.submission.id}`);
            console.log(`  ${dim('Status:')}        ${job.submission.status}`);
            console.log(`  ${dim('Solver:')}        ${job.submission.solver_wallet}`);
            if (job.submission.result_url) console.log(`  ${dim('URL:')}           ${job.submission.result_url}`);
            console.log(`  ${dim('Submitted:')}     ${job.submission.created_at}`);
            console.log();
            console.log(dim('Result:'));
            console.log(job.submission.result_text);
          }
          return;
        }

        console.log(JSON.stringify(job, null, 2));
      } catch (err) {
        handleError(err);
      }
    });
}

interface CreateCliOpts {
  nonInteractive?: boolean;
  title?: string;
  description?: string;
  reward?: string;
  category?: string;
  interactionType?: string;
  deadline?: string;
}

function registerCreateSubcommand(jobs: Command, program: Command): void {
  jobs
    .command('create')
    .description('Post a new job to the bounty board')
    .option('--non-interactive', 'Use CLI flags instead of interactive prompts')
    .option('--title <title>', 'Job title')
    .option('--description <desc>', 'Job description')
    .option('--reward <usdc>', 'Reward amount in USDC (e.g. 10.5)')
    .option('--category <cat>', 'Category slug')
    .option('--interaction-type <type>', 'Interaction type: M2M, H2M, M2H (default: M2M)')
    .option('--deadline <iso>', 'Deadline as ISO 8601 date string')
    .action(async (opts: CreateCliOpts) => {
      const parentOpts = program.opts<{ gateway?: string; keypair?: string; json?: boolean }>();
      try {
        const client = await getClient(parentOpts);
        const createOpts = opts.nonInteractive
          ? buildNonInteractiveOpts(opts)
          : await runInteractiveCreate();

        if (!createOpts) return;

        const result = await client.jobs.create(createOpts);
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        handleError(err);
      }
    });
}

function buildNonInteractiveOpts(o: CreateCliOpts): CreateJobOptions {
  if (!o.title) { console.error(red('Error: --title is required in non-interactive mode')); process.exit(1); }
  if (!o.description) { console.error(red('Error: --description is required in non-interactive mode')); process.exit(1); }
  if (!o.reward) { console.error(red('Error: --reward is required in non-interactive mode')); process.exit(1); }

  return {
    title: o.title,
    description: o.description,
    reward_usdc: parseFloat(o.reward),
    ...(o.category ? { category: o.category } : {}),
    ...(o.interactionType ? { interaction_type: o.interactionType as InteractionType } : {}),
    ...(o.deadline ? { deadline: o.deadline } : {}),
  };
}

async function runInteractiveCreate(): Promise<CreateJobOptions | null> {
  const { input, select, confirm } = await loadPrompts();

  const title = await input({ message: 'Job title:' });
  const description = await input({ message: 'Description:' });
  const rewardStr = await input({ message: 'Reward (USDC):', default: '10' });
  const rewardUsdc = parseFloat(rewardStr);
  const category = (await input({ message: 'Category (optional, press Enter to skip):' })) || undefined;
  const interactionType = await select<InteractionType>({
    message: 'Interaction type:',
    choices: [
      { value: 'M2M', name: 'M2M (Machine to Machine)' },
      { value: 'H2M', name: 'H2M (Human to Machine)' },
      { value: 'M2H', name: 'M2H (Machine to Human)' },
    ],
  });
  const deadline = (await input({ message: 'Deadline ISO 8601 (optional, press Enter to skip):' })) || undefined;

  console.log();
  console.log(bold('Review:'));
  console.log(`  Title:       ${title}`);
  console.log(`  Description: ${truncate(description, 60)}`);
  console.log(`  Reward:      ${rewardUsdc} USDC`);
  console.log(`  Type:        ${interactionType}`);
  if (category) console.log(`  Category:    ${category}`);
  if (deadline) console.log(`  Deadline:    ${deadline}`);
  console.log();

  const confirmed = await confirm({ message: 'Post this job?' });
  if (!confirmed) { console.log(dim('Cancelled.')); return null; }

  return {
    title, description, reward_usdc: rewardUsdc,
    interaction_type: interactionType,
    ...(category ? { category } : {}),
    ...(deadline ? { deadline } : {}),
  };
}

function registerClaimSubcommand(jobs: Command, program: Command): void {
  jobs
    .command('claim <id>')
    .description('Claim an open job as solver')
    .action(async (id: string) => {
      const parentOpts = program.opts<{ gateway?: string; keypair?: string; json?: boolean }>();
      try {
        const client = await getClient(parentOpts);
        const result = await client.jobs.claim(id);
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        handleError(err);
      }
    });
}

function registerSubmitSubcommand(jobs: Command, program: Command): void {
  jobs
    .command('submit <id>')
    .description('Submit work for a claimed job')
    .option('--text <text>', 'Result text (markdown)')
    .option('--url <url>', 'Result URL (e.g. GitHub PR link)')
    .action(async (id: string, opts: { text?: string; url?: string }) => {
      const parentOpts = program.opts<{ gateway?: string; keypair?: string; json?: boolean }>();
      try {
        const client = await getClient(parentOpts);

        let resultText = opts.text;
        let resultUrl = opts.url;

        if (!resultText) {
          const { input } = await loadPrompts();
          resultText = await input({ message: 'Result text (markdown):' });
          if (!resultUrl) {
            resultUrl = (await input({ message: 'Result URL (optional, press Enter to skip):' })) || undefined;
          }
        }

        const result = await client.jobs.submit(id, {
          result_text: resultText,
          ...(resultUrl ? { result_url: resultUrl } : {}),
        });
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        handleError(err);
      }
    });
}

function registerAcceptSubcommand(jobs: Command, program: Command): void {
  jobs
    .command('accept <id>')
    .description('Accept a submission and release escrow to solver')
    .action(async (id: string) => {
      const parentOpts = program.opts<{ gateway?: string; keypair?: string; json?: boolean }>();
      try {
        const client = await getClient(parentOpts);
        const result = await client.jobs.accept(id);
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        handleError(err);
      }
    });
}

function registerRejectSubcommand(jobs: Command, program: Command): void {
  jobs
    .command('reject <id>')
    .description('Reject a submission (2nd rejection triggers admin dispute review)')
    .option('--reason <text>', 'Rejection reason')
    .action(async (id: string, opts: { reason?: string }) => {
      const parentOpts = program.opts<{ gateway?: string; keypair?: string; json?: boolean }>();
      try {
        const client = await getClient(parentOpts);
        let reason = opts.reason;
        if (!reason) {
          const { input } = await loadPrompts();
          reason = await input({ message: 'Rejection reason:' });
        }
        const result = await client.jobs.reject(id, { reason });
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        handleError(err);
      }
    });
}

function registerCancelSubcommand(jobs: Command, program: Command): void {
  jobs
    .command('cancel <id>')
    .description('Cancel a job and refund escrow')
    .action(async (id: string) => {
      const parentOpts = program.opts<{ gateway?: string; keypair?: string; json?: boolean }>();
      try {
        const client = await getClient(parentOpts);
        const result = await client.jobs.cancel(id);
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        handleError(err);
      }
    });
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Register the `proxygate jobs` command group.
 *
 * Provides 8 subcommands for the bounty board:
 * list, get, create, claim, submit, accept, reject, cancel.
 *
 * JSON output by default; use --table for human-readable output.
 */
export function registerJobsCommand(program: Command): void {
  const jobs = program
    .command('jobs')
    .description('Interact with the bounty board (list, post, claim, submit, accept, reject, cancel)')
    .addHelpText(
      'after',
      '\nSubcommands:\n' +
        '  list                         List jobs on the bounty board\n' +
        '  get <id>                     Get job details\n' +
        '  create                       Post a new job (interactive)\n' +
        '  claim <id>                   Claim an open job\n' +
        '  submit <id>                  Submit work for a job\n' +
        '  accept <id>                  Accept submission, release escrow\n' +
        '  reject <id>                  Reject submission\n' +
        '  cancel <id>                  Cancel job, refund escrow\n\n' +
        'Examples:\n' +
        '  $ proxygate jobs list                          JSON output (default)\n' +
        '  $ proxygate jobs list --status open --table    Table format\n' +
        '  $ proxygate jobs create                        Interactive mode\n' +
        '  $ proxygate jobs create --non-interactive --title "..." --description "..." --reward 10\n',
    );

  registerListSubcommand(jobs, program);
  registerGetSubcommand(jobs, program);
  registerCreateSubcommand(jobs, program);
  registerClaimSubcommand(jobs, program);
  registerSubmitSubcommand(jobs, program);
  registerAcceptSubcommand(jobs, program);
  registerRejectSubcommand(jobs, program);
  registerCancelSubcommand(jobs, program);
}
