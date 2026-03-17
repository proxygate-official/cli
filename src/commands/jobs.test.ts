import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerJobsCommand } from './jobs.js';

const mockJobsList = vi.fn();
const mockJobsGet = vi.fn();
const mockJobsCreate = vi.fn();
const mockJobsClaim = vi.fn();
const mockJobsSubmit = vi.fn();
const mockJobsAccept = vi.fn();
const mockJobsReject = vi.fn();
const mockJobsCancel = vi.fn();

vi.mock('@proxygate/sdk', () => ({
  ProxyGateClient: {
    create: vi.fn().mockResolvedValue({
      jobs: {
        list: (...args: unknown[]) => mockJobsList(...args),
        get: (...args: unknown[]) => mockJobsGet(...args),
        create: (...args: unknown[]) => mockJobsCreate(...args),
        claim: (...args: unknown[]) => mockJobsClaim(...args),
        submit: (...args: unknown[]) => mockJobsSubmit(...args),
        accept: (...args: unknown[]) => mockJobsAccept(...args),
        reject: (...args: unknown[]) => mockJobsReject(...args),
        cancel: (...args: unknown[]) => mockJobsCancel(...args),
      },
    }),
  },
  ProxyGateError: class extends Error {
    code: string;
    action?: string;
    constructor(msg: string, code: string) {
      super(msg);
      this.code = code;
    }
  },
}));

vi.mock('../config.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    gatewayUrl: 'http://localhost:3001',
    keypairPath: '/tmp/key.json',
  }),
}));

const JOB = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  title: 'Build a web scraper',
  description: 'Scrape product prices',
  status: 'open',
  reward_lamports: 50_000_000,
  poster_wallet: '3uQP6CDmzC274Q3V5ZZDWfqTXRJuV6Kx6C6TgNKUSJF3',
  interaction_type: 'M2M',
  category: 'devtools',
  created_at: '2026-03-10T12:00:00Z',
};

describe('jobs list', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const run = async (...args: string[]): Promise<void> => {
    const program = new Command('proxygate');
    program.option('--gateway <url>').option('--keypair <path>').option('--json');
    registerJobsCommand(program);
    await program.parseAsync(['node', 'proxygate', 'jobs', ...args]);
  };

  it('outputs JSON by default', async () => {
    const result = { jobs: [JOB], total: 1 };
    mockJobsList.mockResolvedValue(result);
    await run('list');

    expect(logSpy).toHaveBeenCalledTimes(1);
    const parsed: unknown = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(parsed).toEqual(result);
  });

  it('outputs table with --table flag', async () => {
    mockJobsList.mockResolvedValue({ jobs: [JOB], total: 1 });
    await run('list', '--table');

    const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('Jobs');
    expect(output).toContain('Build a w');
  });

  it('shows empty message when no jobs', async () => {
    mockJobsList.mockResolvedValue({ jobs: [], total: 0 });
    await run('list', '--table');

    const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('No jobs found');
  });

  it('passes filters to SDK', async () => {
    mockJobsList.mockResolvedValue({ jobs: [], total: 0 });
    await run('list', '--status', 'open', '--category', 'devtools', '--limit', '5');

    expect(mockJobsList).toHaveBeenCalledWith({
      status: 'open',
      category: 'devtools',
      interaction_type: undefined,
      search: undefined,
      limit: 5,
    });
  });
});

describe('jobs get', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const run = async (...args: string[]): Promise<void> => {
    const program = new Command('proxygate');
    program.option('--gateway <url>').option('--keypair <path>').option('--json');
    registerJobsCommand(program);
    await program.parseAsync(['node', 'proxygate', 'jobs', ...args]);
  };

  it('outputs job detail as JSON', async () => {
    const detail = { ...JOB, total_cost: 52_500_000, buyer_fee: 2_500_000, seller_fee: 2_500_000 };
    mockJobsGet.mockResolvedValue(detail);
    await run('get', JOB.id);

    expect(logSpy).toHaveBeenCalledTimes(1);
    const parsed: unknown = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(parsed).toEqual(detail);
  });

  it('outputs formatted detail with --table', async () => {
    const detail = {
      ...JOB,
      total_cost: 52_500_000,
      buyer_fee: 2_500_000,
      seller_fee: 2_500_000,
      rejection_count: 0,
    };
    mockJobsGet.mockResolvedValue(detail);
    await run('get', JOB.id, '--table');

    const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('Build a web scraper');
    expect(output).toContain('open');
  });
});

describe('jobs claim', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const run = async (...args: string[]): Promise<void> => {
    const program = new Command('proxygate');
    program.option('--gateway <url>').option('--keypair <path>').option('--json');
    registerJobsCommand(program);
    await program.parseAsync(['node', 'proxygate', 'jobs', ...args]);
  };

  it('claims a job by ID', async () => {
    const result = { status: 'claimed', job_id: JOB.id };
    mockJobsClaim.mockResolvedValue(result);
    await run('claim', JOB.id);

    expect(mockJobsClaim).toHaveBeenCalledWith(JOB.id);
    expect(logSpy).toHaveBeenCalledTimes(1);
    const parsed: unknown = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(parsed).toEqual(result);
  });
});

describe('jobs submit', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const run = async (...args: string[]): Promise<void> => {
    const program = new Command('proxygate');
    program.option('--gateway <url>').option('--keypair <path>').option('--json');
    registerJobsCommand(program);
    await program.parseAsync(['node', 'proxygate', 'jobs', ...args]);
  };

  it('submits work with --text and --url', async () => {
    const result = { status: 'in_review', submission_id: 'sub-1' };
    mockJobsSubmit.mockResolvedValue(result);
    await run('submit', JOB.id, '--text', 'Done: all tests pass', '--url', 'https://github.com/pr/1');

    expect(mockJobsSubmit).toHaveBeenCalledWith(JOB.id, {
      result_text: 'Done: all tests pass',
      result_url: 'https://github.com/pr/1',
    });
    const parsed: unknown = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(parsed).toEqual(result);
  });
});

describe('jobs accept', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const run = async (...args: string[]): Promise<void> => {
    const program = new Command('proxygate');
    program.option('--gateway <url>').option('--keypair <path>').option('--json');
    registerJobsCommand(program);
    await program.parseAsync(['node', 'proxygate', 'jobs', ...args]);
  };

  it('accepts a submission', async () => {
    const result = { status: 'completed', job_id: JOB.id };
    mockJobsAccept.mockResolvedValue(result);
    await run('accept', JOB.id);

    expect(mockJobsAccept).toHaveBeenCalledWith(JOB.id);
    const parsed: unknown = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(parsed).toEqual(result);
  });
});

describe('jobs reject', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const run = async (...args: string[]): Promise<void> => {
    const program = new Command('proxygate');
    program.option('--gateway <url>').option('--keypair <path>').option('--json');
    registerJobsCommand(program);
    await program.parseAsync(['node', 'proxygate', 'jobs', ...args]);
  };

  it('rejects a submission with --reason', async () => {
    const result = { status: 'claimed', rejection_count: 1 };
    mockJobsReject.mockResolvedValue(result);
    await run('reject', JOB.id, '--reason', 'Tests are failing');

    expect(mockJobsReject).toHaveBeenCalledWith(JOB.id, { reason: 'Tests are failing' });
    const parsed: unknown = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(parsed).toEqual(result);
  });
});

describe('jobs cancel', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const run = async (...args: string[]): Promise<void> => {
    const program = new Command('proxygate');
    program.option('--gateway <url>').option('--keypair <path>').option('--json');
    registerJobsCommand(program);
    await program.parseAsync(['node', 'proxygate', 'jobs', ...args]);
  };

  it('cancels a job', async () => {
    const result = { status: 'cancelled', job_id: JOB.id };
    mockJobsCancel.mockResolvedValue(result);
    await run('cancel', JOB.id);

    expect(mockJobsCancel).toHaveBeenCalledWith(JOB.id);
    const parsed: unknown = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(parsed).toEqual(result);
  });
});
