// Para upload de imágenes, configurar con tus credenciales de Supabase
// Obtener de: https://supabase.com/dashboard/project/_/settings/api

declare const import_meta_env: any;
export const SUPABASE_URL = typeof import_meta_env !== 'undefined' ? import_meta_env.VITE_SUPABASE_URL || '' : '';
export const SUPABASE_ANON_KEY = typeof import_meta_env !== 'undefined' ? import_meta_env.VITE_SUPABASE_ANON_KEY || '' : '';

// Función helper para subir imágenes
export async function uploadImage(file: File, bucket: string = 'images'): Promise<string> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Configurar SUPABASE_URL y SUPABASE_ANON_KEY en .env');
  }

  const formData = new FormData();
  formData.append('file', file);

  const fileName = `${Date.now()}-${file.name}`;

  try {
    const response = await fetch(
      `${SUPABASE_URL}/storage/v1/object/${bucket}/${fileName}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: file,
      }
    );

    if (!response.ok) {
      throw new Error('Error al subir imagen');
    }

    return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${fileName}`;
  } catch (error) {
    console.error('Error uploading image:', error);
    throw error;
  }
}
