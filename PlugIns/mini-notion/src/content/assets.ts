export async function saveAsset(file: File) {
  if (window.native) return window.native.saveAsset(file.name, await file.arrayBuffer());
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function saveSpaceFile(pageId: string, folderId: string | null, file: File) {
  if (!window.native) return null;
  return window.native.uploadToSpace(pageId, folderId, file.name, await file.arrayBuffer());
}
