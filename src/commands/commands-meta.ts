import type { Command } from 'commander';

interface CommandMeta {
  name: string;
  description: string;
  auth_required: boolean;
  json_output: boolean;
  args?: Array<{ name: string; required: boolean; description: string }>;
  options?: Array<{ flag: string; description: string; default?: string }>;
  output_schema?: Record<string, string>;
  examples?: string[];
}

/** Machine-readable command catalog for coding agents. */
export function registerCommandsMetaCommand(program: Command): void {
  program
    .command('commands')
    .description('Machine-readable command catalog with args, types, and schemas (for AI agents)')
    .action(() => {
      const commands: CommandMeta[] = [
        {
          name: 'metadata',
          description: 'Project metadata — version, capabilities, config paths',
          auth_required: false,
          json_output: true,
        },
        {
          name: 'commands',
          description: 'This command — lists all commands with args and schemas',
          auth_required: false,
          json_output: true,
        },
        {
          name: 'getting-started',
          description: 'Interactive first-time setup wizard',
          auth_required: false,
          json_output: false,
        },
        {
          name: 'pricing',
          description: 'Browse available APIs with pricing',
          auth_required: false,
          json_output: true,
          options: [
            { flag: '--query <q>', description: 'Search by name or description' },
            { flag: '--category <slug>', description: 'Filter by category' },
            { flag: '--sort <field>', description: 'Sort by: price, name, trust_score', default: 'name' },
          ],
          output_schema: { type: 'object', key_field: 'apis', item_fields: 'listing_id, service_slug, service_name, base_url, price_per_request, pricing_unit, available_rpm, trust_score, listing_type' },
          examples: ['proxygate pricing --json', 'proxygate pricing --category finance --json'],
        },
        {
          name: 'categories',
          description: 'List API categories',
          auth_required: false,
          json_output: true,
          output_schema: { type: 'array', item_fields: 'slug, name, listing_count, subcategories' },
        },
        {
          name: 'balance',
          description: 'Check USDC vault balance',
          auth_required: true,
          json_output: true,
          output_schema: { type: 'object', fields: 'balance, pending_settlement, available, currency, usdc_balance, usdc_available' },
          examples: ['proxygate balance --json'],
        },
        {
          name: 'proxy',
          description: 'Send a proxied request to an upstream API',
          auth_required: true,
          json_output: false,
          args: [
            { name: 'listing-id', required: true, description: 'UUID of the listing to proxy through' },
            { name: 'path', required: true, description: 'URL path to request (e.g. /v1/data)' },
          ],
          options: [
            { flag: '-X <method>', description: 'HTTP method', default: 'GET' },
            { flag: '-d <data>', description: 'Request body (JSON string)' },
            { flag: '-H <header>', description: 'Custom header (repeatable)' },
            { flag: '--verbose', description: 'Show response headers' },
          ],
          examples: [
            'proxygate proxy <id> "/v1/forecast?lat=52.52&lon=13.41"',
            'proxygate proxy <id> "/v1/chat" -X POST -d \'{"model":"gpt-4","messages":[...]}\'',
          ],
        },
        {
          name: 'deposit',
          description: 'Deposit USDC into vault',
          auth_required: true,
          json_output: true,
          args: [{ name: 'amount', required: true, description: 'USDC amount to deposit' }],
        },
        {
          name: 'withdraw',
          description: 'Withdraw USDC from vault',
          auth_required: true,
          json_output: true,
          args: [{ name: 'amount', required: true, description: 'USDC amount to withdraw' }],
        },
        {
          name: 'usage',
          description: 'View API usage history',
          auth_required: true,
          json_output: true,
          options: [
            { flag: '--days <n>', description: 'Number of days to show', default: '30' },
            { flag: '--service <slug>', description: 'Filter by service' },
          ],
          output_schema: { type: 'object', key_field: 'entries', item_fields: 'timestamp, service, path, status_code, cost_micro_cents, latency_ms' },
        },
        {
          name: 'listings list',
          description: 'List your seller listings',
          auth_required: true,
          json_output: true,
          output_schema: { type: 'object', key_field: 'listings', item_fields: 'id, service_slug, base_url, auth_pattern, price_per_request, is_active, listing_type, key_masked' },
        },
        {
          name: 'listings create',
          description: 'Create a new seller listing',
          auth_required: true,
          json_output: true,
          options: [
            { flag: '--non-interactive', description: 'Use CLI flags instead of prompts' },
            { flag: '--service-name <name>', description: 'Service name (required)' },
            { flag: '--base-url <url>', description: 'HTTPS base URL (required)' },
            { flag: '--auth-pattern <p>', description: 'none, bearer, header, query, basic, oauth2_cc' },
            { flag: '--api-key <key>', description: 'API key (for bearer/header/query/basic)' },
            { flag: '--type <type>', description: 'proxy, skill, product, dataset, service, connector', default: 'proxy' },
            { flag: '--endpoint-url <url>', description: 'Skill endpoint URL (--type skill)' },
            { flag: '--file-url <url>', description: 'Product file URL (--type product)' },
            { flag: '--bulk-url <url>', description: 'Dataset bulk URL (--type dataset)' },
            { flag: '--webhook-url <url>', description: 'Service webhook URL (--type service)' },
            { flag: '--relay-url <url>', description: 'Connector relay URL (--type connector)' },
            { flag: '--categories <slugs>', description: 'Comma-separated category slugs (required)' },
            { flag: '--price <n>', description: 'Price per request in micro-USDC (1000 = $0.001, min 1000, or 0 for free with admin approval)', default: '1000' },
            { flag: '--total-rpm <n>', description: 'Total RPM capacity', default: '60' },
            { flag: '--description <text>', description: 'Listing description' },
            { flag: '--docs <file>', description: 'OpenAPI spec or markdown file' },
            { flag: '--shield <on|off>', description: 'Enable request scanning', default: 'off' },
          ],
          output_schema: { type: 'object', fields: 'id, service, is_active, key_masked, sync_status' },
          examples: [
            'proxygate listings create --non-interactive --service-name "My API" --base-url "https://api.example.com" --auth-pattern bearer --api-key "sk-..." --categories "ai" --price 1000 --json',
            'proxygate listings create --non-interactive --type skill --service-name "Code Review" --base-url "https://myskill.com" --endpoint-url "https://myskill.com/invoke" --categories "devtools" --json',
          ],
        },
        {
          name: 'listings update',
          description: 'Update a listing (price, capacity, categories)',
          auth_required: true,
          json_output: true,
          args: [{ name: 'id', required: true, description: 'Listing UUID' }],
          options: [
            { flag: '--price <n>', description: 'New price in lamports' },
            { flag: '--total-rpm <n>', description: 'New RPM capacity' },
            { flag: '--categories <slugs>', description: 'New categories' },
            { flag: '--description <text>', description: 'New description' },
          ],
        },
        {
          name: 'listings pause',
          description: 'Pause a listing (remove from marketplace)',
          auth_required: true,
          json_output: true,
          args: [{ name: 'id', required: true, description: 'Listing UUID' }],
        },
        {
          name: 'listings unpause',
          description: 'Re-enable a paused listing',
          auth_required: true,
          json_output: true,
          args: [{ name: 'id', required: true, description: 'Listing UUID' }],
        },
        {
          name: 'listings delete',
          description: 'Delete a listing permanently',
          auth_required: true,
          json_output: true,
          args: [{ name: 'id', required: true, description: 'Listing UUID' }],
          options: [{ flag: '--yes', description: 'Skip confirmation' }],
        },
        {
          name: 'listings upload-docs',
          description: 'Upload API documentation for a listing',
          auth_required: true,
          json_output: true,
          args: [
            { name: 'id', required: true, description: 'Listing UUID' },
            { name: 'file', required: true, description: 'Path to .yaml/.json (OpenAPI) or .md (markdown)' },
          ],
        },
        {
          name: 'listings rotate-key',
          description: 'Rotate API key for a listing',
          auth_required: true,
          json_output: true,
          args: [{ name: 'id', required: true, description: 'Listing UUID' }],
        },
        {
          name: 'tunnel',
          description: 'Expose local service via WebSocket tunnel',
          auth_required: true,
          json_output: false,
          options: [
            { flag: '--port <n>', description: 'Local port to tunnel' },
            { flag: '--config <file>', description: 'Tunnel config YAML', default: 'proxygate.tunnel.yaml' },
          ],
        },
        {
          name: 'rate',
          description: 'Rate a seller after a proxy request',
          auth_required: true,
          json_output: true,
          options: [
            { flag: '--listing <id>', description: 'Listing UUID' },
            { flag: '--score <1-5>', description: 'Rating score' },
          ],
        },
        {
          name: 'create',
          description: 'Scaffold a new Proxygate agent project',
          auth_required: false,
          json_output: false,
          args: [{ name: 'name', required: false, description: 'Project name' }],
        },
        {
          name: 'test',
          description: 'Validate your service locally before going live',
          auth_required: false,
          json_output: true,
        },
        {
          name: 'settlements',
          description: 'View settlement history (seller payouts)',
          auth_required: true,
          json_output: true,
          options: [
            { flag: '--days <n>', description: 'Number of days', default: '30' },
            { flag: '--role <buyer|seller>', description: 'View as buyer or seller' },
          ],
        },
      ];

      console.log(JSON.stringify({ commands, total: commands.length }, null, 2));
    });
}
