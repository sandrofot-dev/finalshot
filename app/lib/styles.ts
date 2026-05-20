export type BackgroundType =
  | "corporate-office"
  | "modern-startup"
  | "blurred-people"
  | "executive-dark"
  | "minimal-white";

export type StyleOption = {
  id: BackgroundType;
  name: string;
  description: string;
  prompt: string;
};

export const styleOptions: StyleOption[] = [
  {
    id: "corporate-office",
    name: "Escritório Corporativo",
    description: "Ambiente profissional com escritório elegante ao fundo",
    prompt:
      "professional corporate office background, natural light, high-end business environment, realistic depth of field",
  },
  {
    id: "modern-startup",
    name: "Startup Moderna",
    description: "Ambiente moderno com design clean",
    prompt:
      "modern startup office, glass walls, creative workspace, cinematic lighting",
  },
  {
    id: "blurred-people",
    name: "Empresa com Pessoas Desfocadas",
    description: "Ambiente empresarial com pessoas ao fundo desfocadas",
    prompt:
      "corporate environment with blurred people in background, shallow depth of field, professional headshot",
  },
  {
    id: "executive-dark",
    name: "Executivo Fundo Escuro",
    description: "Fundo escuro premium estilo CEO",
    prompt:
      "dark executive portrait background, dramatic lighting, high-end CEO look",
  },
  {
    id: "minimal-white",
    name: "Minimalista Branco",
    description: "Fundo branco clean estilo LinkedIn",
    prompt:
      "clean white studio background, soft lighting, professional LinkedIn headshot",
  },
];
