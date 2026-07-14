import 'dotenv/config';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const identifier = process.argv[2]?.trim();

if (!identifier) {
  console.error('Thiếu email hoặc Firebase UID.');
  console.error('Cách dùng: npm run set-admin -- <email-hoặc-uid>');
  process.exit(1);
}

if (!getApps().length) {
  initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || 'tanle-dev' });
}

async function main() {
  const auth = getAuth();
  const user = identifier.includes('@')
    ? await auth.getUserByEmail(identifier)
    : await auth.getUser(identifier);

  await auth.setCustomUserClaims(user.uid, {
    ...user.customClaims,
    admin: true,
  });

  console.log(`Đã cấp custom claim admin=true cho ${user.email || '(không có email)'} (${user.uid}).`);
  console.log('Tài khoản cần đăng nhập lại hoặc làm mới ID token để claim có hiệu lực.');
}

main().catch((error) => {
  console.error('Không thể cấp quyền admin:', error instanceof Error ? error.message : error);
  process.exit(1);
});
