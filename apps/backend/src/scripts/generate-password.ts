import * as bcrypt from 'bcrypt';

async function generateHash(password: string) {
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(password, salt);
  console.log('Password:', password);
  console.log('Hash:', hash);
  console.log('\nSQL para insertar usuario:');
  console.log(`INSERT INTO admin_users (email, password_hash, name, role, department, active) VALUES`);
  console.log(`('<email>', '${hash}', '<nombre>', 'admin_sis', '<departamento>', true);`);
}

const password = process.argv[2];
if (!password) {
  console.error('Uso: npx ts-node src/scripts/generate-password.ts <contraseña>');
  process.exit(1);
}
generateHash(password);
