import { Command } from "commander";

export function registerInitCommand(program: Command) {
  program
    .command("init <shell>")
    .description("Output shell integration code")
    .action((shell: string) => {
      if (shell !== "bash" && shell !== "zsh") {
        console.error("Only bash and zsh are supported.");
        process.exit(1);
      }
      
      const shellFn = `wtx() {
  if [ "$1" = "cd" ]; then
    shift
    local _wtx_path
    _wtx_path=$(command wtx _resolve-path "$@") || return $?
    builtin cd "$_wtx_path" || return $?
  else
    command wtx "$@"
  fi
}
`;
      process.stdout.write(shellFn);
    });
}
