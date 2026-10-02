interface DialogOptions { title?: string; defaultPath?: string; multiple?: boolean; filters?: { name: string; extensions: string[] }[] }
export async function open(options: DialogOptions): Promise<string | null> { return await window.go.main.App.OpenFile(options) as string || null }
export async function save(options: DialogOptions): Promise<string | null> { return await window.go.main.App.SaveFile(options) as string || null }
