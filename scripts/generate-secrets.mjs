// Run locally; values are written only to ignored files. Never commit private keys.
import {generateKeyPairSync,randomBytes} from 'node:crypto';
import {writeFileSync,existsSync} from 'node:fs';
if(existsSync('.env.local'))throw Error('.env.local already exists. Preserve it; do not rotate existing keys accidentally.');
const {privateKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const jwk=privateKey.export({format:'jwk'});
const publicKey=Buffer.concat([Buffer.from([4]),Buffer.from(jwk.x,'base64url'),Buffer.from(jwk.y,'base64url')]).toString('base64url');
const values={CARE_ACCESS_TOKEN:randomBytes(32).toString('base64url'),CRON_SECRET:randomBytes(32).toString('base64url'),VAPID_PUBLIC_KEY:publicKey,VAPID_PRIVATE_KEY:jwk.d,VAPID_SUBJECT:'https://h4nsk0y.github.io/nezhno/',ALLOWED_ORIGIN:'https://h4nsk0y.github.io'};
writeFileSync('.env.local',Object.entries(values).map(([k,v])=>k+'='+v).join('\n')+'\n',{mode:0o600});
console.log('Created .env.local with 6 values. Keep this file private; paste its values into Supabase Edge Functions → Secrets.');
