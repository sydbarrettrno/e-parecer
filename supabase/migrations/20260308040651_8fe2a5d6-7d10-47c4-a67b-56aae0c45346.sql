
-- Create enum for document categories
CREATE TYPE public.categoria_documento AS ENUM (
  'ADMINISTRATIVO',
  'MEMORIAL_OU_TR',
  'ORCAMENTO',
  'CRONOGRAMA',
  'RESPONSABILIDADE_TECNICA',
  'OUTROS'
);

-- Create enum for process status
CREATE TYPE public.status_processo AS ENUM (
  'cadastrado',
  'analisando',
  'revisao',
  'concluido',
  'erro'
);

-- Create processos table
CREATE TABLE public.processos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome_processo TEXT NOT NULL,
  numero_processo TEXT NOT NULL,
  orgao TEXT NOT NULL,
  secretaria TEXT NOT NULL,
  data_upload TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status public.status_processo NOT NULL DEFAULT 'cadastrado',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create arquivos table
CREATE TABLE public.arquivos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  processo_id UUID NOT NULL REFERENCES public.processos(id) ON DELETE CASCADE,
  nome_original TEXT NOT NULL,
  extensao TEXT NOT NULL,
  hash TEXT,
  categoria public.categoria_documento DEFAULT 'OUTROS',
  storage_path TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create dados_extraidos table
CREATE TABLE public.dados_extraidos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  processo_id UUID NOT NULL REFERENCES public.processos(id) ON DELETE CASCADE,
  campo TEXT NOT NULL,
  valor TEXT NOT NULL,
  origem_documento TEXT,
  trecho TEXT,
  confianca TEXT DEFAULT 'media',
  editado BOOLEAN DEFAULT false,
  oculto BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create pareceres table
CREATE TABLE public.pareceres (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  processo_id UUID NOT NULL REFERENCES public.processos(id) ON DELETE CASCADE,
  versao INTEGER NOT NULL DEFAULT 1,
  data_execucao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  hash_documentos TEXT,
  conteudo_json JSONB,
  storage_path TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.processos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arquivos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dados_extraidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pareceres ENABLE ROW LEVEL SECURITY;

-- For now, allow public access (no auth required) - can be tightened later
CREATE POLICY "Allow all access to processos" ON public.processos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to arquivos" ON public.arquivos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to dados_extraidos" ON public.dados_extraidos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to pareceres" ON public.pareceres FOR ALL USING (true) WITH CHECK (true);

-- Create storage bucket for process files
INSERT INTO storage.buckets (id, name, public) VALUES ('processos', 'processos', false);
CREATE POLICY "Allow all access to processos bucket" ON storage.objects FOR ALL USING (bucket_id = 'processos') WITH CHECK (bucket_id = 'processos');

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_processos_updated_at
  BEFORE UPDATE ON public.processos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
