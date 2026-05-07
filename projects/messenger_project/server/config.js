import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

export const PORT = parseInt(process.env.PORT || '3001', 10);

export const PUBLIC_URL = process.env.PUBLIC_HTTPS_URL || process.env.PUBLIC_URL || '';

export const ADMIN_LOGIN = process.env.ADMIN_LOGIN || 'admin';
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme';

export const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
export const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';

export const ALLOWED_ORIGINS = [
  process.env.PUBLIC_HTTPS_URL,
  'http://localhost:3001',
  'http://localhost:5173',
  'http://localhost:19006',
].filter(Boolean);

export const FSB_AVATAR_URL = '/avatars/fsb.png';
export const SBER_AVATAR_URL = '/avatars/sberbank.png';
export const GOSUSLUGI_AVATAR_URL = '/avatars/gosuslugi.png';

export const SERVICE_AVATARS = {
  manager_fsb: FSB_AVATAR_URL,
  sberbank: SBER_AVATAR_URL,
  gosuslugi: GOSUSLUGI_AVATAR_URL,
};

export const SETTINGS_DEFAULTS = {
  maxMessageLength: 5000,
  maxFileSize: '50mb',
  maxFileSizeMb: 50,
  callTimeout: 90,
  maxUploadKbps: 0,
  maxDownloadKbps: 0,
};

export const MANAGER_ROLES = ['manager_closing', 'manager_fsb'];

export const APP_MIN_ANDROID_VERSION_CODE = 34;
export const APP_LATEST_ANDROID_VERSION_NAME = '1.0.2';

export const DIR = __dirname;
