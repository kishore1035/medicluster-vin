// Run locally: node scripts/configure-sms-gateway.js [server-origin]
// Configuration is private; no token is printed or embedded in the APK.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const dotenv = require('dotenv');

const envFile = path.resolve(__dirname, '../.env');
let source = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '';
const current = dotenv.parse(source);
const addresses = Object.values(os.networkInterfaces()).flat().filter(item => item && item.family === 'IPv4' && !item.internal);
const address = addresses.find(item => !item.address.startsWith('172.17.'))?.address || '127.0.0.1';
const origin = new URL(process.argv[2] || `http://${address}:${current.PORT || '5000'}`);
if (!['https:', 'http:'].includes(origin.protocol) || origin.username || origin.password
  || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('Provide server origin without path or credentials');
const token = current.SMS_GATEWAY_TOKEN?.length >= 32 ? current.SMS_GATEWAY_TOKEN : crypto.randomBytes(32).toString('hex');
for (const [key, value] of Object.entries({ OTP_DELIVERY_MODE: 'android', SMS_GATEWAY_TOKEN: token, OTP_DEV_LOG: 'false' })) {
  const expression = new RegExp(`^${key}=.*$`, 'm');
  source = expression.test(source) ? source.replace(expression, `${key}=${value}`) : `${source.trimEnd()}\n${key}=${value}\n`;
}
fs.writeFileSync(envFile, source, { mode: 0o600 });
fs.chmodSync(envFile, 0o600);
const directory = path.join(os.homedir(), '.local/share/medicluster/sms-sender');
fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
const setupFile = path.join(directory, 'setup.txt');
fs.writeFileSync(setupFile, `MediCluster SMS Sender — private phone setup\n\nServer URL: ${origin.origin}\nSender key: ${token}\n\nInstall sender APK on your Android phone.\nPaste server URL and sender key, grant SMS permission, choose default SMS SIM, then tap Start sender.\nPhone must reach server URL; localhost points to the phone itself. For local HTTP, use same network and debug APK.\nKeep this key private. Restart backend after changing .env.\n`, { mode: 0o600 });
fs.chmodSync(setupFile, 0o600);
console.log(`Android SMS mode configured. Private phone setup: ${setupFile}`);
