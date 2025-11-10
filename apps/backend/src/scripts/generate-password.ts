import * as bcrypt from 'bcrypt';

async function generateHash(password: string) {
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(password, salt);
  console.log('Password:', password);
  console.log('Hash:', hash);
  console.log('\nSQL para insertar usuario:');
  console.log(`INSERT INTO admin_users (email, password_hash, name, role, department, active) VALUES`);
  console.log(`('admin@maldonado.gub.uy', '${hash}', 'Administrador Sistema', 'admin_sis', 'Informática', true);`);
}

const password = process.argv[2] || 'Admin123!';
generateHash(password);
