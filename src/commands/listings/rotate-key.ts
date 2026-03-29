import type { Command } from 'commander';
import type { RotateKeyOptions } from '@proxygate/sdk';
import { getClient } from '../../helpers.js';
import { handleError, loadPrompts, promptCredentials } from './helpers.js';

/** Register the `listings rotate-key` subcommand. */
export function registerRotateKeySubcommand(listings: Command, program: Command): void {
  listings
    .command('rotate-key <id>')
    .description('Rotate API key or OAuth2 credentials for a listing')
    .option('--non-interactive', 'Use CLI flags instead of interactive prompts')
    .option('--credential <key>', 'New API key / credential')
    .option('--oauth2-flow-type <type>', 'OAuth2 flow: standard, google_jwt')
    .option('--oauth2-client-id <id>', 'OAuth2 client ID')
    .option('--oauth2-client-secret <secret>', 'OAuth2 client secret')
    .option('--oauth2-service-account-json <path>', 'Google service account JSON path')
    .option('--validation-endpoint <path>', 'Validation endpoint path')
    .action(async (id: string, opts: {
      nonInteractive?: boolean;
      credential?: string;
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
            ...(opts.credential ? { api_key: opts.credential } : {}),
            ...(opts.oauth2FlowType ? { oauth2_flow_type: opts.oauth2FlowType as 'standard' | 'google_jwt' } : {}),
            ...(opts.oauth2ClientId ? { oauth2_client_id: opts.oauth2ClientId } : {}),
            ...(opts.oauth2ClientSecret ? { oauth2_client_secret: opts.oauth2ClientSecret } : {}),
            ...(opts.oauth2ServiceAccountJson ? { oauth2_service_account_json: opts.oauth2ServiceAccountJson } : {}),
            ...(opts.validationEndpoint ? { validation_endpoint: opts.validationEndpoint } : {}),
          };
        } else {
          const listing = await client.listings.get(id);
          const { select, password } = await loadPrompts();

          const credType = await select<'api_key' | 'oauth2'>({
            message: `Current auth: ${listing.auth_pattern}. Rotate:`,
            choices: [
              { value: 'api_key', name: 'API key' },
              { value: 'oauth2', name: 'OAuth2 credentials' },
            ],
          });

          if (credType === 'api_key') {
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
