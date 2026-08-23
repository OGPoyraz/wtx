import { Command } from "commander";

export function registerInitCommand(program: Command) {
  program
    .command("init <shell>")
    .description("Output shell integration code")
    .action((shell: string) => {
      if (shell !== "bash" && shell !== "zsh" && shell !== "fish") {
        console.error("Only bash, zsh, and fish are supported. (If you previously used a custom workaround for fish, you can now use 'wtx init fish').");
        process.exit(1);
      }
      
      if (shell === "fish") {
        const shellFn = `function wtx
  if test "$argv[1]" = cd
    if test (count $argv) -lt 2
      command wtx cd
      return $status
    end
    set -l path (command wtx _resolve-path $argv[2..-1])
    if test $status -eq 0; cd $path; return; end
    return $status
  end
  command wtx $argv
end
`;
        process.stdout.write(shellFn);
        return;
      }

      const shellFn = `wtx() {
  if [ "$1" = "cd" ]; then
    if [ $# -lt 2 ]; then
      command wtx cd
      return $?
    fi
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
