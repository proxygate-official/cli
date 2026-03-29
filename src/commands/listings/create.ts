import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import type { Command } from 'commander';
import type { CreateListingOptions, ListingAuthPattern } from '@proxygate/sdk';
import { SHIELD_SURCHARGE_DISPLAY } from '@proxygate/sdk';
import { getClient } from '../../helpers.js';
import { bold, red, dim, green } from '../../format.js';
import { truncate, handleError, loadPrompts, promptCredentials, printTestResults } from './helpers.js';

interface CreateCliOpts {
  nonInteractive?: boolean;
  serviceName?: string;
  baseUrl?: string;
  authPattern?: string;
  credential?: string;
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
  docs?: string;
  type?: string;
  endpointUrl?: string;
  fileUrl?: string;
  bulkUrl?: string;
  webhookUrl?: string;
  relayUrl?: string;
  relayMethod?: string;
  platform?: string;
  skipTest?: boolean;
}

type ListingTypeValue = 'proxy' | 'skill' | 'product' | 'dataset' | 'service' | 'connector';

function detectDocType(filePath: string): 'openapi' | 'markdown' {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.md' || ext === '.markdown') return 'markdown';
  return 'openapi';
}

/** Register the `listings create` subcommand. */
export function registerCreateSubcommand(listings: Command, program: Command): void {
  listings
    .command('create')
    .description('Create a new seller listing')
    .addHelpText('after', `
Examples:
  # API proxy with bearer auth
  $ proxygate listings create --non-interactive \\
      --service-name "My API" --base-url "https://api.example.com" \\
      --auth-pattern bearer --credential "sk-..." \\
      --categories "ai" --price 10000

  # Public API (no auth key needed)
  $ proxygate listings create --non-interactive \\
      --service-name "Weather API" --base-url "https://api.open-meteo.com" \\
      --auth-pattern none --categories "weather" --price 10000

  # Skill (AI agent tool / MCP endpoint)
  $ proxygate listings create --non-interactive --type skill \\
      --service-name "Code Review" --base-url "https://myskill.com" \\
      --endpoint-url "https://myskill.com/invoke" \\
      --categories "devtools" --price 50000

  # Product (digital file download)
  $ proxygate listings create --non-interactive --type product \\
      --service-name "Training Dataset" --base-url "https://data.co" \\
      --file-url "https://data.co/files/dataset.parquet" \\
      --categories "data" --price 100000

  # Service (webhook relay)
  $ proxygate listings create --non-interactive --type service \\
      --service-name "Email Sender" --base-url "https://hooks.co" \\
      --webhook-url "https://hooks.co/send" --relay-method POST \\
      --categories "communication" --price 20000

  # Connector (platform integration)
  $ proxygate listings create --non-interactive --type connector \\
      --service-name "Slack Bot" --base-url "https://relay.co" \\
      --relay-url "https://relay.co/slack" --platform slack \\
      --categories "communication" --price 15000

  # Interactive mode (guided prompts)
  $ proxygate listings create
`)
    .option('--non-interactive', 'Use CLI flags instead of interactive prompts')
    .option('--service-name <name>', 'Service name')
    .option('--base-url <url>', 'Service base URL (https://...)')
    .option('--auth-pattern <pattern>', 'Auth pattern: none (public), bearer, header, query, basic, oauth2_cc')
    .option('--credential <key>', 'Seller API key / credential (for bearer/header/query/basic)')
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
    .option('--shield <on|off>', `Shield request scanning — ${SHIELD_SURCHARGE_DISPLAY}/req from payout (default: off)`)
    .option('--docs <file>', 'Path to OpenAPI spec (.yaml/.json) or markdown (.md) documentation')
    .option('--type <type>', 'Listing type: proxy, skill, product, dataset, service, connector (default: proxy)')
    .option('--endpoint-url <url>', 'Skill endpoint URL (required for --type skill)')
    .option('--file-url <url>', 'Product file URL (required for --type product)')
    .option('--bulk-url <url>', 'Dataset bulk data URL (required for --type dataset)')
    .option('--webhook-url <url>', 'Service webhook URL (required for --type service)')
    .option('--relay-url <url>', 'Connector relay URL (required for --type connector)')
    .option('--relay-method <method>', 'Service HTTP method: GET, POST, PUT (default: POST)')
    .option('--platform <name>', 'Connector platform: slack, notion, discord, github, custom')
    .option('--skip-test', 'Skip endpoint validation (listing activates immediately)')
    .action(async (opts: CreateCliOpts) => {
      const parentOpts = program.opts<{ gateway?: string; keypair?: string; json?: boolean }>();
      try {
        const client = await getClient(parentOpts);
        const createOpts = opts.nonInteractive
          ? await buildNonInteractiveOpts(opts)
          : await runInteractiveCreate();
        if (!createOpts) return;
        const result = await client.listings.create(createOpts);

        // Display test results if present (not when --skip-test was used)
        if (result.test_results && !opts.skipTest) {
          console.log(JSON.stringify({ id: result.id, service: result.service, is_active: result.is_active, key_masked: result.key_masked, sync_status: result.sync_status }, null, 2));
          printTestResults(result);
          if (result.test_passed === false) {
            process.exit(1);
          }
        } else {
          console.log(JSON.stringify(result, null, 2));
        }

        // Upload docs if --docs flag provided
        if (opts.docs) {
          try {
            const content = await readFile(opts.docs, 'utf-8');
            const docType = detectDocType(opts.docs);
            await client.listings.uploadDocs(result.id, { doc_type: docType, content });
            console.log(green(`Documentation uploaded (${docType})`));
          } catch (docErr) {
            console.error(red(`Warning: listing created but docs upload failed: ${docErr instanceof Error ? docErr.message : 'unknown'}`));
          }
        }
      } catch (err) {
        handleError(err);
      }
    });
}

function buildTypeMetadata(listingType: ListingTypeValue, o: CreateCliOpts): Record<string, unknown> | undefined {
  switch (listingType) {
    case 'skill':
      if (!o.endpointUrl) { console.error(red('Error: --endpoint-url required for --type skill')); process.exit(1); }
      return { endpoint_url: o.endpointUrl };
    case 'product':
      if (!o.fileUrl) { console.error(red('Error: --file-url required for --type product')); process.exit(1); }
      return { file_url: o.fileUrl };
    case 'dataset':
      if (!o.bulkUrl) { console.error(red('Error: --bulk-url required for --type dataset')); process.exit(1); }
      return { bulk_url: o.bulkUrl };
    case 'service':
      if (!o.webhookUrl) { console.error(red('Error: --webhook-url required for --type service')); process.exit(1); }
      return { webhook_url: o.webhookUrl, relay_method: o.relayMethod ?? 'POST' };
    case 'connector':
      if (!o.relayUrl) { console.error(red('Error: --relay-url required for --type connector')); process.exit(1); }
      return { relay_url: o.relayUrl, platform: o.platform ?? 'custom' };
    default:
      return undefined;
  }
}

async function buildNonInteractiveOpts(o: CreateCliOpts): Promise<CreateListingOptions> {
  if (!o.serviceName) { console.error(red('Error: --service-name is required in non-interactive mode')); process.exit(1); }
  if (!o.baseUrl) { console.error(red('Error: --base-url is required in non-interactive mode')); process.exit(1); }
  if (!o.categories) { console.error(red('Error: --categories is required in non-interactive mode')); process.exit(1); }

  const listingType = (o.type ?? 'proxy') as ListingTypeValue;
  const typeMetadata = buildTypeMetadata(listingType, o);

  return {
    service_name: o.serviceName, service_base_url: o.baseUrl,
    auth_pattern: (o.authPattern as ListingAuthPattern) ?? (o.credential ? 'bearer' : 'none'),
    total_rpm: parseInt(o.totalRpm, 10), reserved_rpm: parseInt(o.reservedRpm, 10),
    price_per_request: parseInt(o.price, 10),
    category_slugs: o.categories.split(',').map((s) => s.trim()),
    ...(listingType !== 'proxy' ? { listing_type: listingType } : {}),
    ...(typeMetadata ? { type_metadata: typeMetadata } : {}),
    ...(o.description ? { description: o.description } : {}),
    ...(o.credential ? { api_key: o.credential } : {}),
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
    ...(o.skipTest ? { skip_test: true } : {}),
  };
}

async function runInteractiveCreate(): Promise<CreateListingOptions | null> {
  const { input, select, confirm } = await loadPrompts();

  // Type selection first
  const listingType = await select<string>({
    message: 'Listing type:',
    choices: [
      { value: 'proxy', name: 'API Proxy (forward requests to your API)' },
      { value: 'skill', name: 'Skill (AI agent tool / MCP endpoint)' },
      { value: 'product', name: 'Product (digital file / download)' },
      { value: 'dataset', name: 'Dataset (bulk data access)' },
      { value: 'service', name: 'Service (webhook / automation relay)' },
      { value: 'connector', name: 'Connector (platform integration)' },
    ],
  });

  // Type-specific prompts
  let typeMetadata: Record<string, unknown> | undefined;
  switch (listingType) {
    case 'skill':
      typeMetadata = { endpoint_url: await input({ message: 'Skill endpoint URL (https://):' }) };
      break;
    case 'product':
      typeMetadata = { file_url: await input({ message: 'Product file URL (https://):' }) };
      break;
    case 'dataset':
      typeMetadata = { bulk_url: await input({ message: 'Dataset bulk URL (https://):' }) };
      break;
    case 'service':
      typeMetadata = {
        webhook_url: await input({ message: 'Webhook URL (https://):' }),
        relay_method: await select({ message: 'Relay HTTP method:', choices: [{ value: 'POST' }, { value: 'GET' }, { value: 'PUT' }] }),
      };
      break;
    case 'connector':
      typeMetadata = {
        relay_url: await input({ message: 'Relay URL (https://):' }),
        platform: await select({ message: 'Platform:', choices: [{ value: 'slack' }, { value: 'notion' }, { value: 'discord' }, { value: 'github' }, { value: 'custom' }] }),
      };
      break;
  }

  const serviceName = await input({ message: 'Service name:' });
  const baseUrl = await input({ message: 'Service base URL (https://):' });

  // Product/dataset skip auth (default none)
  const isNoCredType = listingType === 'product' || listingType === 'dataset';
  const authPattern = isNoCredType
    ? 'none' as ListingAuthPattern
    : await select<ListingAuthPattern>({
        message: 'Auth pattern:',
        choices: [
          { value: 'none', name: 'No authentication (public API)' },
          { value: 'bearer', name: 'Bearer token (Authorization: Bearer ...)' },
          { value: 'header', name: 'Custom header (X-Api-Key: ...)' },
          { value: 'query', name: 'Query parameter (?api_key=...)' },
          { value: 'basic', name: 'Basic auth (Authorization: Basic ...)' },
          { value: 'oauth2_cc', name: 'OAuth2 client credentials' },
        ],
      });
  const credentials = (authPattern === 'none') ? {} : await promptCredentials(authPattern);
  const shieldEnabled = isNoCredType ? false : await confirm({ message: `Enable Shield request scanning? Scans responses for harmful content (${SHIELD_SURCHARGE_DISPLAY}/req from your payout)`, default: false });

  const totalRpm = parseInt(await input({ message: 'Total RPM capacity:', default: '60' }), 10);
  const reservedRpm = parseInt(await input({ message: 'Reserved RPM (for your own use):', default: '0' }), 10);
  const pricePerRequest = parseInt(await input({ message: 'Price per request (micro-cents, 1000 = $0.01):', default: '1000' }), 10);
  const categorySlugs = (await input({ message: 'Category slugs (comma-separated, e.g. "llm,ai"):' }))
    .split(',').map((s) => s.trim()).filter(Boolean);
  const description = (await input({ message: 'Description (optional, press Enter to skip):' })) || undefined;

  console.log();
  console.log(bold('Review:'));
  if (listingType !== 'proxy') console.log(`  Type:        ${listingType}`);
  console.log(`  Service:     ${serviceName}`);
  console.log(`  Base URL:    ${baseUrl}`);
  console.log(`  Auth:        ${authPattern}`);
  console.log(`  RPM:         ${totalRpm} (reserved: ${reservedRpm})`);
  console.log(`  Price:       ${pricePerRequest} micro-cents/req`);
  console.log(`  Categories:  ${categorySlugs.join(', ')}`);
  if (description) console.log(`  Description: ${truncate(description, 60)}`);
  if (shieldEnabled) console.log(`  Shield:      enabled`);
  console.log();

  const confirmed = await confirm({ message: 'Create this listing?' });
  if (!confirmed) { console.log(dim('Cancelled.')); return null; }

  return {
    service_name: serviceName, service_base_url: baseUrl, auth_pattern: authPattern,
    total_rpm: totalRpm, reserved_rpm: reservedRpm, price_per_request: pricePerRequest,
    category_slugs: categorySlugs,
    ...(listingType !== 'proxy' ? { listing_type: listingType as ListingTypeValue } : {}),
    ...(typeMetadata ? { type_metadata: typeMetadata } : {}),
    ...(description ? { description } : {}), ...credentials,
    ...(shieldEnabled ? { shield_enabled: true } : {}),
  };
}
