import { readFile } from 'node:fs/promises';
import type { Command } from 'commander';
import type { CreateListingOptions, ListingAuthPattern } from '@proxygate/sdk';
import { getClient } from '../../helpers.js';
import { bold, red, dim } from '../../format.js';
import { truncate, handleError, loadPrompts, promptCredentials } from './helpers.js';

interface CreateCliOpts {
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
  endpoints?: string;
  validationEndpoint?: string;
  shield?: string;
}

/** Register the `listings create` subcommand. */
export function registerCreateSubcommand(listings: Command, program: Command): void {
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
    .option('--endpoints <file>', 'Path to JSON file containing EndpointSpec[]')
    .option('--validation-endpoint <path>', 'Validation endpoint path')
    .option('--shield <on|off>', 'Enable Shield response scanning (default: off)')
    .action(async (opts: CreateCliOpts) => {
      const parentOpts = program.opts<{ gateway?: string; keypair?: string; json?: boolean }>();
      try {
        const client = await getClient(parentOpts);
        const createOpts = opts.nonInteractive
          ? await buildNonInteractiveOpts(opts)
          : await runInteractiveCreate();
        if (!createOpts) return;
        const result = await client.listings.create(createOpts);
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        handleError(err);
      }
    });
}

async function buildNonInteractiveOpts(o: CreateCliOpts): Promise<CreateListingOptions> {
  if (!o.serviceName) { console.error(red('Error: --service-name is required in non-interactive mode')); process.exit(1); }
  if (!o.baseUrl) { console.error(red('Error: --base-url is required in non-interactive mode')); process.exit(1); }
  if (!o.categories) { console.error(red('Error: --categories is required in non-interactive mode')); process.exit(1); }

  return {
    service_name: o.serviceName, service_base_url: o.baseUrl,
    auth_pattern: (o.authPattern as ListingAuthPattern) ?? 'bearer',
    total_rpm: parseInt(o.totalRpm, 10), reserved_rpm: parseInt(o.reservedRpm, 10),
    price_per_request: parseInt(o.price, 10),
    category_slugs: o.categories.split(',').map((s) => s.trim()),
    ...(o.description ? { description: o.description } : {}),
    ...(o.apiKey ? { api_key: o.apiKey } : {}),
    ...(o.headerName ? { header_name: o.headerName } : {}),
    ...(o.queryParam ? { query_param: o.queryParam } : {}),
    ...(o.basicUser ? { basic_user: o.basicUser } : {}),
    ...(o.oauth2FlowType ? { oauth2_flow_type: o.oauth2FlowType as 'standard' | 'google_jwt' } : {}),
    ...(o.oauth2TokenUrl ? { oauth2_token_url: o.oauth2TokenUrl } : {}),
    ...(o.oauth2Scopes ? { oauth2_scopes: o.oauth2Scopes } : {}),
    ...(o.oauth2ClientId ? { oauth2_client_id: o.oauth2ClientId } : {}),
    ...(o.oauth2ClientSecret ? { oauth2_client_secret: o.oauth2ClientSecret } : {}),
    ...(o.oauth2ServiceAccountJson ? { oauth2_service_account_json: await readFile(o.oauth2ServiceAccountJson, 'utf-8') } : {}),
    ...(o.allowedPaths ? { allowed_paths: o.allowedPaths.split(',').map((s) => s.trim()) } : {}),
    ...(o.endpoints ? { endpoints: JSON.parse(await readFile(o.endpoints, 'utf-8')) } : {}),
    ...(o.validationEndpoint ? { validation_endpoint: o.validationEndpoint } : {}),
    ...(o.shield === 'on' ? { shield_enabled: true } : {}),
  };
}

async function runInteractiveCreate(): Promise<CreateListingOptions | null> {
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
  const totalRpm = parseInt(await input({ message: 'Total RPM capacity:', default: '60' }), 10);
  const reservedRpm = parseInt(await input({ message: 'Reserved RPM (for your own use):', default: '0' }), 10);
  const pricePerRequest = parseInt(await input({ message: 'Price per request (micro-cents):', default: '1000' }), 10);
  const categorySlugs = (await input({ message: 'Category slugs (comma-separated, e.g. "llm,ai"):' }))
    .split(',').map((s) => s.trim()).filter(Boolean);
  const description = (await input({ message: 'Description (optional, press Enter to skip):' })) || undefined;

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
  if (!confirmed) { console.log(dim('Cancelled.')); return null; }

  return {
    service_name: serviceName, service_base_url: baseUrl, auth_pattern: authPattern,
    total_rpm: totalRpm, reserved_rpm: reservedRpm, price_per_request: pricePerRequest,
    category_slugs: categorySlugs, ...(description ? { description } : {}), ...credentials,
  };
}
