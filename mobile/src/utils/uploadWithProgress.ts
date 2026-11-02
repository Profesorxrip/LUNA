import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "../services/supabase";

/** @supabase/supabase-js'in storage.upload()'i ilerleme (progress) callback'i
 * SUNMUYOR (fetch tabanli). Supabase Storage'in KENDI REST uc noktasina
 * (ayni bucket'i, ayni path/izin kurallari) dogrudan bir XMLHttpRequest ile
 * yukleyip xhr.upload.onprogress ile GERCEK yuzdeyi okuyoruz. */
export async function uploadWithProgress(
  bucket: string,
  path: string,
  data: ArrayBuffer,
  contentType: string,
  onProgress?: (pct: number) => void
): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token ?? SUPABASE_ANON_KEY;

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", SUPABASE_ANON_KEY);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`upload_failed_${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("upload_network_error"));
    xhr.send(data);
  });
}
