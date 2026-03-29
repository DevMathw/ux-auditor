export interface AuditChecks {
  accessibility: boolean;
  visualHierarchy: boolean;
  uxClarity: boolean;
}

export interface PageInfo {
  title: string;
  metaDesc: string;
  h1s: string[];
  h2s: string[];
  imgCount: number;
  imgsNoAlt: number;
  linkCount: number;
  btnCount: number;
  formCount: number;
  labelCount: number;
  inputCount: number;
  langAttr: string;
  metaViewport: string;
  hasSkipLink: boolean;
  hasARIA: boolean;
  navCount: number;
  mainCount: number;
  footerCount: number;
  bodyText: string;
}

export interface AuditProblem {
  title: string;
  description: string;
  category: "accessibility" | "hierarchy" | "clarity" | "performance";
  severity: "high" | "medium" | "low";
}

export interface AuditImprovement {
  title: string;
  description: string;
  impact: "high" | "medium" | "low";
}

export interface AuditResult {
  overallScore: number;
  scoreBreakdown: {
    accessibility: number | null;
    visualHierarchy: number | null;
    uxClarity: number | null;
  };
  summary: string;
  problems: AuditProblem[];
  improvements: AuditImprovement[];
  quickWins: string;
  strengths: string;
}

export interface AuditRequest {
  url: string;
  checks: AuditChecks;
}