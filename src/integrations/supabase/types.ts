export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      arquivos: {
        Row: {
          categoria: Database["public"]["Enums"]["categoria_documento"] | null
          created_at: string
          extensao: string
          hash: string | null
          id: string
          nome_original: string
          processo_id: string
          storage_path: string | null
        }
        Insert: {
          categoria?: Database["public"]["Enums"]["categoria_documento"] | null
          created_at?: string
          extensao: string
          hash?: string | null
          id?: string
          nome_original: string
          processo_id: string
          storage_path?: string | null
        }
        Update: {
          categoria?: Database["public"]["Enums"]["categoria_documento"] | null
          created_at?: string
          extensao?: string
          hash?: string | null
          id?: string
          nome_original?: string
          processo_id?: string
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "arquivos_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
        ]
      }
      dados_extraidos: {
        Row: {
          campo: string
          confianca: string | null
          created_at: string
          editado: boolean | null
          id: string
          oculto: boolean | null
          origem_documento: string | null
          processo_id: string
          trecho: string | null
          valor: string
        }
        Insert: {
          campo: string
          confianca?: string | null
          created_at?: string
          editado?: boolean | null
          id?: string
          oculto?: boolean | null
          origem_documento?: string | null
          processo_id: string
          trecho?: string | null
          valor: string
        }
        Update: {
          campo?: string
          confianca?: string | null
          created_at?: string
          editado?: boolean | null
          id?: string
          oculto?: boolean | null
          origem_documento?: string | null
          processo_id?: string
          trecho?: string | null
          valor?: string
        }
        Relationships: [
          {
            foreignKeyName: "dados_extraidos_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
        ]
      }
      pareceres: {
        Row: {
          conteudo_json: Json | null
          created_at: string
          data_execucao: string
          hash_documentos: string | null
          id: string
          processo_id: string
          storage_path: string | null
          versao: number
        }
        Insert: {
          conteudo_json?: Json | null
          created_at?: string
          data_execucao?: string
          hash_documentos?: string | null
          id?: string
          processo_id: string
          storage_path?: string | null
          versao?: number
        }
        Update: {
          conteudo_json?: Json | null
          created_at?: string
          data_execucao?: string
          hash_documentos?: string | null
          id?: string
          processo_id?: string
          storage_path?: string | null
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "pareceres_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
        ]
      }
      processos: {
        Row: {
          created_at: string
          data_upload: string
          id: string
          nome_processo: string
          numero_processo: string
          orgao: string
          secretaria: string
          status: Database["public"]["Enums"]["status_processo"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          data_upload?: string
          id?: string
          nome_processo: string
          numero_processo: string
          orgao: string
          secretaria: string
          status?: Database["public"]["Enums"]["status_processo"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          data_upload?: string
          id?: string
          nome_processo?: string
          numero_processo?: string
          orgao?: string
          secretaria?: string
          status?: Database["public"]["Enums"]["status_processo"]
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      categoria_documento:
        | "ADMINISTRATIVO"
        | "MEMORIAL_OU_TR"
        | "ORCAMENTO"
        | "CRONOGRAMA"
        | "RESPONSABILIDADE_TECNICA"
        | "OUTROS"
      status_processo:
        | "cadastrado"
        | "analisando"
        | "revisao"
        | "concluido"
        | "erro"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      categoria_documento: [
        "ADMINISTRATIVO",
        "MEMORIAL_OU_TR",
        "ORCAMENTO",
        "CRONOGRAMA",
        "RESPONSABILIDADE_TECNICA",
        "OUTROS",
      ],
      status_processo: [
        "cadastrado",
        "analisando",
        "revisao",
        "concluido",
        "erro",
      ],
    },
  },
} as const
