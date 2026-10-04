{ editorPackages, ... }:

{
  # Document typesetting tools are part of the user environment, separate from
  # the general-purpose programming language servers and CLI tools.
  home.packages = [ editorPackages.texlive ];
}
