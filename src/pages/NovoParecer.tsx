import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Upload, Loader2, FileArchive } from "lucide-react";
import JSZip from "jszip";

const ACCEPTED_EXTENSIONS = [".pdf", ".docx", ".xlsx", ".odt"];

const NovoProcesso = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    nome_processo: "",
    numero_processo: "",
    orgao: "",
    secretaria: "",
  });
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [fileList, setFileList] = useState<string[]>([]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".zip")) {
      toast.error("Apenas arquivos .zip são aceitos");
      return;
    }
    setZipFile(file);
    try {
      const zip = await JSZip.loadAsync(file);
      const names = Object.keys(zip.files).filter(
        (n) => !zip.files[n].dir && ACCEPTED_EXTENSIONS.some((ext) => n.toLowerCase().endsWith(ext))
      );
      setFileList(names);
    } catch {
      toast.error("Erro ao ler arquivo ZIP");
    }
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!zipFile) throw new Error("Envie um arquivo ZIP");

      // 1. Create process
      const { data: processo, error: procError } = await supabase
        .from("processos")
        .insert({
          nome_processo: form.nome_processo,
          numero_processo: form.numero_processo,
          orgao: form.orgao,
          secretaria: form.secretaria,
          status: "analisando" as const,
        })
        .select()
        .single();
      if (procError) throw procError;

      // 2. Upload ZIP to storage
      const zipPath = `${processo.id}/processo.zip`;
      const { error: uploadError } = await supabase.storage
        .from("processos")
        .upload(zipPath, zipFile);
      if (uploadError) throw uploadError;

      // 3. Extract and upload individual files, register in arquivos table
      const zip = await JSZip.loadAsync(zipFile);
      const validFiles = Object.keys(zip.files).filter(
        (n) => !zip.files[n].dir && ACCEPTED_EXTENSIONS.some((ext) => n.toLowerCase().endsWith(ext))
      );

      for (const fileName of validFiles) {
        const fileData = await zip.files[fileName].async("blob");
        const ext = fileName.substring(fileName.lastIndexOf(".")).toLowerCase();
        const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
        const storagePath = `${processo.id}/${safeName}`;

        await supabase.storage.from("processos").upload(storagePath, fileData);

        await supabase.from("arquivos").insert({
          processo_id: processo.id,
          nome_original: fileName,
          extensao: ext,
          storage_path: storagePath,
        });
      }

      // 4. Call analysis edge function
      const { error: fnError } = await supabase.functions.invoke("analyze-documents", {
        body: { processo_id: processo.id },
      });
      if (fnError) {
        console.error("Analysis function error:", fnError);
        // Don't block - user can still review
      }

      return processo;
    },
    onSuccess: (processo) => {
      toast.success("Processo criado! Análise em andamento...");
      navigate(`/revisao/${processo.id}`);
    },
    onError: (error) => {
      toast.error(`Erro: ${error.message}`);
    },
  });

  const isValid =
    form.nome_processo && form.numero_processo && form.orgao && form.secretaria && zipFile;

  return (
    <AppLayout title="Novo Parecer Técnico">
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Cadastro de Processo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="nome">Nome do Processo</Label>
                <Input
                  id="nome"
                  placeholder="Ex: Reforma do Prédio Sede"
                  value={form.nome_processo}
                  onChange={(e) => setForm({ ...form, nome_processo: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="numero">Número do Processo</Label>
                <Input
                  id="numero"
                  placeholder="Ex: 2024/001234"
                  value={form.numero_processo}
                  onChange={(e) => setForm({ ...form, numero_processo: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="orgao">Órgão</Label>
                <Input
                  id="orgao"
                  placeholder="Ex: Prefeitura Municipal"
                  value={form.orgao}
                  onChange={(e) => setForm({ ...form, orgao: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="secretaria">Secretaria Responsável</Label>
                <Input
                  id="secretaria"
                  placeholder="Ex: Secretaria de Obras"
                  value={form.secretaria}
                  onChange={(e) => setForm({ ...form, secretaria: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Arquivo ZIP do Processo</Label>
              <div className="relative">
                <label
                  htmlFor="zip-upload"
                  className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/50 px-6 py-10 transition-colors hover:border-primary/50 hover:bg-muted"
                >
                  {zipFile ? (
                    <>
                      <FileArchive className="mb-3 h-10 w-10 text-primary" />
                      <span className="font-medium text-foreground">{zipFile.name}</span>
                      <span className="mt-1 text-sm text-muted-foreground">
                        {fileList.length} documento(s) identificado(s)
                      </span>
                    </>
                  ) : (
                    <>
                      <Upload className="mb-3 h-10 w-10 text-muted-foreground" />
                      <span className="font-medium text-foreground">
                        Clique para enviar arquivo ZIP
                      </span>
                      <span className="mt-1 text-sm text-muted-foreground">
                        Formatos aceitos: PDF, DOCX, XLSX, ODT
                      </span>
                    </>
                  )}
                </label>
                <input
                  id="zip-upload"
                  type="file"
                  accept=".zip"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
            </div>

            {fileList.length > 0 && (
              <div className="rounded-lg border bg-muted/30 p-4">
                <h4 className="mb-2 text-sm font-medium">Documentos no ZIP:</h4>
                <ul className="space-y-1">
                  {fileList.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <FileArchive className="h-3.5 w-3.5" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Button
              className="w-full"
              size="lg"
              disabled={!isValid || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processando...
                </>
              ) : (
                "Iniciar Análise"
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default NovoProcesso;
