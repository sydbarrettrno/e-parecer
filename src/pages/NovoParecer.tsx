import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Upload, Loader2, FileArchive } from "lucide-react";
import { listZipContents, isValidZip } from "@/services/zipExtractor";
import { executePipelineUpload } from "@/services/pipeline";

const NovoParecer = () => {
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
    if (!isValidZip(file)) {
      toast.error("Apenas arquivos .zip são aceitos");
      return;
    }
    setZipFile(file);
    try {
      const names = await listZipContents(file);
      setFileList(names);
    } catch {
      toast.error("Erro ao ler arquivo ZIP");
    }
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!zipFile) throw new Error("Envie um arquivo ZIP");
      return executePipelineUpload(form, zipFile);
    },
    onSuccess: (result) => {
      toast.success("Processo criado! Análise em andamento...");
      navigate(`/revisao/${result.processoId}`);
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

export default NovoParecer;
