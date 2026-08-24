export interface TemplateVars {
  root: string;
  repo: string;
  branch: string;
  main: string;
  wt: string;
  postfix: string;
  port?: number;
}

export function expandTemplate(template: string, vars: TemplateVars): string {
  let res = template
    .replaceAll("{root}", vars.root)
    .replaceAll("{repo}", vars.repo)
    .replaceAll("{branch}", vars.branch)
    .replaceAll("{main}", vars.main)
    .replaceAll("{wt}", vars.wt)
    .replaceAll("{postfix}", vars.postfix);

  if (vars.port !== undefined) {
    res = res.replaceAll("{port}", String(vars.port));
  }

  return res;
}
