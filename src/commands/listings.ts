import type { Command } from 'commander';
import { ProxyGateError } from '@proxygate/sdk';
import type {
  CreateListingOptions,
  ListingAuthPattern,
  RotateKeyOptions,
} from '@proxygate/sdk';
import { getClient } from '../helpers.js';
import { bold, green, yellow, red, dim, formatTable } from '../format.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Truncate a string to N chars, adding "..." if truncated. */
function truncate(str: string, n: number): string {
  return str.length > n ? str.slice(0, n - 3) + '...' : str;
}

/** Standard error handler matching existing CLI pattern. */
function handleError(err: unknown): never {
  if (err instanceof ProxyGateError) {
    console.error(red(`Error [${err.code}]: ${err.message}`));
    if (err.action) console.error(dim(`Suggestion: ${err.action}`));
    process.exit(1);
  }
  if (err instanceof Error) {
    console.error(red(`Error: ${err.message}`));
    process.exit(1);
  }
  throw err;
}

// ---------------------------------------------------------------------------
// Interactive prompts (lazy-loaded to avoid import overhead for non-interactive)
// ---------------------------------------------------------------------------

async function loadPrompts(): Promise<typeof import('@inquirer/prompts')> {
  return import('@inquirer/prompts');
}

/** Prompt for auth credentials based on auth pattern. */
async function promptCredentials(authPattern: ListingAuthPattern): Promise<
  Partial<
    Pick<
      CreateListingOptions,
      | 'api_key'
      | 'header_name'
      | 'query_param'
      | 'basic_user'
      | 'oauth2_flow_type'
      | 'oauth2_token_url'
      | 'oauth2_scopes'
      | 'oauth2_client_id'
      | 'oauth2_client_secret'
      | 'oauth2_service_account_json'
    >
  >
> {
  const { input, password, select } = await loadPrompts();

  if (authPattern === 'bearer' || authPattern === 'header' || authPattern === 'query' || authPattern === 'basic') {
    const result: Partial<CreateListingOptions> = {};

    if (authPattern === 'header') {
      result.header_name = await input({ message: 'Header name (e.g. X-Api-Key):' });
    }
    if (authPattern === 'query') {
      result.query_param = await input({ message: 'Query parameter name (e.g. api_key):' });
    }
    if (authPattern === 'basic') {
      result.basic_user = await input({ message: 'Basic auth username:' });
    }

    result.api_key = await password({ message: 'API key:' });
    return result;
  }

  // oauth2_cc
  const flowType = await select<'standard' | 'google_jwt'>({
    message: 'OAuth2 flow type:',
    choices: [
      { value: 'standard', name: 'Standard (client_credentials)' },
      { value: 'google_jwt', name: 'Google JWT (service account)' },
    ],
  });

  const result: Partial<CreateListingOptions> = { oauth2_flow_type: flowType };

  if (flowType === 'standard') {
    result.oauth2_token_url = await input({ message: 'Token URL:' });
    result.oauth2_scopes = await input({ message: 'Scopes (space-separated):' });
    result.oauth2_client_id = await password({ message: 'Client ID:' });
    result.oauth2_client_secret = await password({ message: 'Client secret:' });
  } else {
    result.oauth2_service_account_json = await input({
      message: 'Path to service account JSON:',
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

/**
 * Register the `proxygate listings` command group.
 *
 * Provides 7 subcommands for seller listing management:
 * list, create, update, pause, unpause, delete, rotate-key.
 *
 * JSON output by default; use --table for human-readable output.
 */
export function registerListingsCommand(program: Command): void {
  const listings = program
    .command('listings')
    .description('Manage your seller listings (create, update, pause, delete, rotate keys)')
    .addHelpText(
      'after',
      '\nSubcommands:\n' +
        '  list                         List your seller listings\n' +
        '  create                       Create a new listing (interactive)\n' +
        '  update <id>                  Update a listing\n' +
        '  pause <id>                   Pause a listing\n' +
        '  unpause <id>                 Unpause a listing\n' +
        '  delete <id>                  Delete a listing\n' +
        '  rotate-key <id>              Rotate API key or OAuth2 credentials\n\n' +
        'Examples:\n' +
        '  $ proxygate listings list                  JSON output (default)\n' +
        '  $ proxygate listings list --table          Table format\n' +
        '  $ proxygate listings create                Interactive mode\n' +
        '  $ proxygate listings create --non-interactive --service-name my-api ...\n',
    );

  // -------------------------------------------------------------------------
  // listings list
  // -------------------------------------------------------------------------
  listings
    .command('list')
    .description('List all your seller listings')
    .option('--table', 'Display in human-readable table format')
    .action(async (opts: { table?: boolean }) => {
      const parentOpts = program.opts<{ gateway?: string; keypair?: string; json?: boolean }>();

      try {
        const client = await getClient(parentOpts);
        const result = await client.listings.list();

        if (opts.table) {
          if (result.data.length === 0) {
            console.log(dim('No listings found. Create one with: proxygate listings create'));
            return;
          }

          console.log(bold(`Seller Listings (${result.data.length})`));
          console.log();

          const headers = ['ID', 'Service', 'Status', 'RPM', 'Price', 'Categories'];
          const rows = result.data.map((l) => [
            l.id.slice(0, 8),
            l.service_name,
            l.is_active ? green('active') : yellow('paused'),
            `${l.available_resale_rpm}/${l.total_rpm}`,
            String(l.price_per_request),
            l.categories.join(', ') || dim('none'),
          ]);
          console.log(formatTable(headers, rows));
          return;
        }

        // JSON output (default)
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        handleError(err);
      }
    });

  // -------------------------------------------------------------------------
  // listings create
  // -------------------------------------------------------------------------
  listings
    .command('create')
    .description('Create a new seller listing')
    .option('--non-interactive', 'Use CLI flags instead of interactive prompts')
    .option('--service-name <name>', 'Service name')
    .option('--base-url <url>', 'Service base URL (https://...)')
    .option('--auth-pattern <pattern>', 'Auth pattern: bearer, header, query, basic, oauth2_cc')
    .option('--api-key <key>', 'API key (for bearer/header/query/basic)')
    .option('--header-name <name>', 'Custom header name (for header auth pattern)')
    .option('--query-param <name>', 'Query parameter name (for query auth pattern)')
    .option('--basic-user <user>', 'Basic auth username')
    .option('--oauth2-flow-type <type>', 'OAuth2 flow: standard, google_jwt')
    .option('--oauth2-token-url <url>', 'OAuth2 token URL')
    .option('--oauth2-scopes <scopes>', 'OAuth2 scopes (space-separated)')
    .option('--oauth2-client-id <id>', 'OAuth2 client ID')
    .option('--oauth2-client-secret <secret>', 'OAuth2 client secret')
    .option('--oauth2-service-account-json <path>', 'Google service account JSON path')
    .option('--total-rpm <n>', 'Total RPM capacity', '60')
    .option('--reserved-rpm <n>', 'Reserved RPM (for own use)', '0')
    .option('--price <n>', 'Price per request in micro-cents', '1000')
    .option('--categories <slugs>', 'Category slugs (comma-separated)')
    .option('--description <text>', 'Listing description')
    .option('--allowed-paths <paths>', 'Allowed paths (comma-separated)')
    .option('--validation-endpoint <path>', 'Validation endpoint path')
    .action(async (opts: {
      nonInteractive?: boolean;
      serviceName?: string;
      baseUrl?: string;
      authPattern?: string;
      apiKey?: string;
      headerName?: string;
      queryParam?: string;
      basicUser?: string;
      oauth2FlowType?: string;
      oauth2TokenUrl?: string;
      oauth2Scopes?: string;
      oauth2ClientId?: string;
      oauth2ClientSecret?: string;
      oauth2ServiceAccountJson?: string;
      totalRpm: string;
      reservedRpm: string;
      price: string;
      categories?: string;
      description?: string;
      allowedPaths?: string;
      validationEndpoint?: string;
    }) => {
      const parentOpts = program.opts<{ gateway?: string; keypair?: string; json?: boolean }>();

      try {
        const client = await getClient(parentOpts);
        let createOpts: CreateListingOptions;

        if (opts.nonInteractive) {
          // Non-interactive mode: all fields from CLI flags
          if (!opts.serviceName) {
            console.error(red('Error: --service-name is required in non-interactive mode'));
            process.exit(1);
          }
          if (!opts.baseUrl) {
            console.error(red('Error: --base-url is required in non-interactive mode'));
            process.exit(1);
          }
          if (!opts.categories) {
            console.error(red('Error: --categories is required in non-interactive mode'));
            process.exit(1);
          }

          createOpts = {
            service_name: opts.serviceName,
            service_base_url: opts.baseUrl,
            auth_pattern: (opts.authPattern as ListingAuthPattern) ?? 'bearer',
            total_rpm: parseInt(opts.totalRpm, 10),
            reserved_rpm: parseInt(opts.reservedRpm, 10),
            price_per_request: parseInt(opts.price, 10),
            category_slugs: opts.categories.split(',').map((s) => s.trim()),
            ...(opts.description ? { description: opts.description } : {}),
            ...(opts.apiKey ? { api_key: opts.apiKey } : {}),
            ...(opts.headerName ? { header_name: opts.headerName } : {}),
            ...(opts.queryParam ? { query_param: opts.queryParam } : {}),
            ...(opts.basicUser ? { basic_user: opts.basicUser } : {}),
            ...(opts.oauth2FlowType ? { oauth2_flow_type: opts.oauth2FlowType as 'standard' | 'google_jwt' } : {}),
            ...(opts.oauth2TokenUrl ? { oauth2_token_url: opts.oauth2TokenUrl } : {}),
            ...(opts.oauth2Scopes ? { oauth2_scopes: opts.oauth2Scopes } : {}),
            ...(opts.oauth2ClientId ? { oauth2_client_id: opts.oauth2ClientId } : {}),
            ...(opts.oauth2ClientSecret ? { oauth2_client_secret: opts.oauth2ClientSecret } : {}),
            ...(opts.oauth2ServiceAccountJson ? { oauth2_service_account_json: opts.oauth2ServiceAccountJson } : {}),
            ...(opts.allowedPaths ? { allowed_paths: opts.allowedPaths.split(',').map((s) => s.trim()) } : {}),
            ...(opts.validationEndpoint ? { validation_endpoint: opts.validationEndpoint } : {}),
          };
        } else {
          // Interactive mode
          const { input, select, confirm } = await loadPrompts();

          const serviceName = await input({ message: 'Service name:' });
          const baseUrl = await input({ message: 'Service base URL (https://):' });

          const authPattern = await select<ListingAuthPattern>({
            message: 'Auth pattern:',
            choices: [
              { value: 'bearer', name: 'Bearer token (Authorization: Bearer ...)' },
              { value: 'header', name: 'Custom header (X-Api-Key: ...)' },
              { value: 'query', name: 'Query parameter (?api_key=...)' },
              { value: 'basic', name: 'Basic auth (Authorization: Basic ...)' },
              { value: 'oauth2_cc', name: 'OAuth2 client credentials' },
            ],
          });

          const credentials = await promptCredentials(authPattern);

          const totalRpm = parseInt(
            await input({ message: 'Total RPM capacity:', default: '60' }),
            10,
          );
          const reservedRpm = parseInt(
            await input({ message: 'Reserved RPM (for your own use):', default: '0' }),
            10,
          );
          const pricePerRequest = parseInt(
            await input({ message: 'Price per request (micro-cents):', default: '1000' }),
            10,
          );
          const categorySlugs = (
            await input({ message: 'Category slugs (comma-separated, e.g. "llm,ai"):' })
          )
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);

          const description =
            (await input({ message: 'Description (optional, press Enter to skip):' })) ||
            undefined;

          // Review
          console.log();
          console.log(bold('Review:'));
          console.log(`  Service:     ${serviceName}`);
          console.log(`  Base URL:    ${baseUrl}`);
          console.log(`  Auth:        ${authPattern}`);
          console.log(`  RPM:         ${totalRpm} (reserved: ${reservedRpm})`);
          console.log(`  Price:       ${pricePerRequest} micro-cents/req`);
          console.log(`  Categories:  ${categorySlugs.join(', ')}`);
          if (description) console.log(`  Description: ${truncate(description, 60)}`);
          console.log();

          const confirmed = await confirm({ message: 'Create this listing?' });
          if (!confirmed) {
            console.log(dim('Cancelled.'));
            return;
          }

          createOpts = {
            service_name: serviceName,
            service_base_url: baseUrl,
            auth_pattern: authPattern,
            total_rpm: totalRpm,
            reserved_rpm: reservedRpm,
            price_per_request: pricePerRequest,
            category_slugs: categorySlugs,
            ...(description ? { description } : {}),
            ...credentials,
          };
        }

        const result = await client.listings.create(createOpts);

        // Always JSON output for create
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        handleError(err);
      }
    });

  // -------------------------------------------------------------------------
  // listings update <id>
  // -------------------------------------------------------------------------
  listings
    .command('update <id>')
    .description('Update a listing (capacity, pricing, categories, description, paths)')
    .option('--total-rpm <n>', 'Total RPM capacity')
    .option('--reserved-rpm <n>', 'Reserved RPM')
    .option('--price <n>', 'Price per request in micro-cents')
    .option('--categories <slugs>', 'Category slugs (comma-separated)')
    .option('--description <text>', 'Listing description')
    .option('--allowed-paths <paths>', 'Allowed paths (comma-separated)')
    .action(async (id: string, opts: {
      totalRpm?: string;
      reservedRpm?: string;
      price?: string;
      categories?: string;
      description?: string;
      allowedPaths?: string;
    }) => {
      const parentOpts = program.opts<{ gateway?: string; keypair?: string; json?: boolean }>();

      try {
        const updates: Record<string, unknown> = {};
        if (opts.totalRpm !== undefined) updates.total_rpm = parseInt(opts.totalRpm, 10);
        if (opts.reservedRpm !== undefined) updates.reserved_rpm = parseInt(opts.reservedRpm, 10);
        if (opts.price !== undefined) updates.price_per_request = parseInt(opts.price, 10);
        if (opts.categories !== undefined) updates.category_slugs = opts.categories.split(',').map((s) => s.trim());
        if (opts.description !== undefined) updates.description = opts.description;
        if (opts.allowedPaths !== undefined) updates.allowed_paths = opts.allowedPaths.split(',').map((s) => s.trim());

        if (Object.keys(updates).length === 0) {
          console.error(red('Error: at least one update flag is required'));
          console.error(dim('Available: --total-rpm, --reserved-rpm, --price, --categories, --description, --allowed-paths'));
          process.exit(1);
        }

        const client = await getClient(parentOpts);
        const result = await client.listings.update(id, updates);
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        handleError(err);
      }
    });

  // -------------------------------------------------------------------------
  // listings pause <id>
  // -------------------------------------------------------------------------
  listings
    .command('pause <id>')
    .description('Pause a listing (removes from marketplace routing)')
    .action(async (id: string) => {
      const parentOpts = program.opts<{ gateway?: string; keypair?: string; json?: boolean }>();

      try {
        const client = await getClient(parentOpts);
        const result = await client.listings.pause(id);
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        handleError(err);
      }
    });

  // -------------------------------------------------------------------------
  // listings unpause <id>
  // -------------------------------------------------------------------------
  listings
    .command('unpause <id>')
    .description('Unpause a listing (re-enables marketplace routing)')
    .action(async (id: string) => {
      const parentOpts = program.opts<{ gateway?: string; keypair?: string; json?: boolean }>();

      try {
        const client = await getClient(parentOpts);
        const result = await client.listings.unpause(id);
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        handleError(err);
      }
    });

  // -------------------------------------------------------------------------
  // listings delete <id>
  // -------------------------------------------------------------------------
  listings
    .command('delete <id>')
    .description('Delete a listing (removes API key from Secret Manager)')
    .option('-y, --yes', 'Skip confirmation prompt')
    .action(async (id: string, opts: { yes?: boolean }) => {
      const parentOpts = program.opts<{ gateway?: string; keypair?: string; json?: boolean }>();

      try {
        if (!opts.yes) {
          const { confirm } = await loadPrompts();
          const confirmed = await confirm({
            message: 'Are you sure? This will delete the API key from Secret Manager.',
          });
          if (!confirmed) {
            console.log(dim('Cancelled.'));
            return;
          }
        }

        const client = await getClient(parentOpts);
        const result = await client.listings.delete(id);
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        handleError(err);
      }
    });

  // -------------------------------------------------------------------------
  // listings rotate-key <id>
  // -------------------------------------------------------------------------
  listings
    .command('rotate-key <id>')
    .description('Rotate API key or OAuth2 credentials for a listing')
    .option('--non-interactive', 'Use CLI flags instead of interactive prompts')
    .option('--api-key <key>', 'New API key')
    .option('--oauth2-flow-type <type>', 'OAuth2 flow: standard, google_jwt')
    .option('--oauth2-client-id <id>', 'OAuth2 client ID')
    .option('--oauth2-client-secret <secret>', 'OAuth2 client secret')
    .option('--oauth2-service-account-json <path>', 'Google service account JSON path')
    .option('--validation-endpoint <path>', 'Validation endpoint path')
    .action(async (id: string, opts: {
      nonInteractive?: boolean;
      apiKey?: string;
      oauth2FlowType?: string;
      oauth2ClientId?: string;
      oauth2ClientSecret?: string;
      oauth2ServiceAccountJson?: string;
      validationEndpoint?: string;
    }) => {
      const parentOpts = program.opts<{ gateway?: string; keypair?: string; json?: boolean }>();

      try {
        const client = await getClient(parentOpts);
        let rotateOpts: RotateKeyOptions;

        if (opts.nonInteractive) {
          rotateOpts = {
            ...(opts.apiKey ? { api_key: opts.apiKey } : {}),
            ...(opts.oauth2FlowType ? { oauth2_flow_type: opts.oauth2FlowType as 'standard' | 'google_jwt' } : {}),
            ...(opts.oauth2ClientId ? { oauth2_client_id: opts.oauth2ClientId } : {}),
            ...(opts.oauth2ClientSecret ? { oauth2_client_secret: opts.oauth2ClientSecret } : {}),
            ...(opts.oauth2ServiceAccountJson ? { oauth2_service_account_json: opts.oauth2ServiceAccountJson } : {}),
            ...(opts.validationEndpoint ? { validation_endpoint: opts.validationEndpoint } : {}),
          };
        } else {
          // Interactive: detect current listing auth pattern to show relevant prompts
          const listing = await client.listings.get(id);
          const { select } = await loadPrompts();

          const credType = await select<'api_key' | 'oauth2'>({
            message: `Current auth: ${listing.auth_pattern}. Rotate:`,
            choices: [
              { value: 'api_key', name: 'API key' },
              { value: 'oauth2', name: 'OAuth2 credentials' },
            ],
          });

          if (credType === 'api_key') {
            const { password } = await loadPrompts();
            const apiKey = await password({ message: 'New API key:' });
            rotateOpts = { api_key: apiKey };
          } else {
            const creds = await promptCredentials('oauth2_cc');
            rotateOpts = {
              ...(creds.oauth2_flow_type ? { oauth2_flow_type: creds.oauth2_flow_type } : {}),
              ...(creds.oauth2_client_id ? { oauth2_client_id: creds.oauth2_client_id } : {}),
              ...(creds.oauth2_client_secret ? { oauth2_client_secret: creds.oauth2_client_secret } : {}),
              ...(creds.oauth2_service_account_json ? { oauth2_service_account_json: creds.oauth2_service_account_json } : {}),
            };
          }
        }

        const result = await client.listings.rotateKey(id, rotateOpts);
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        handleError(err);
      }
    });
}
