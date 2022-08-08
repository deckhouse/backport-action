import * as core from "@actions/core";

export function getInputAsArray(
  name: string,
  options?: core.InputOptions
): string[] {
  return getStringAsArray(core.getInput(name, options));
}

export function getStringAsArray(str: string): string[] {
  return str
    .split(",")
    .map((s) => s.trim())
    .filter((x) => x !== "");
}

export function getInputMergeMethod(
  name: string,
  options?: core.InputOptions
): "merge" | "squash" | "rebase" | undefined {
  const value = core.getInput(name, options);
  switch (value.trim()) {
    case "merge":
      return "merge";
    case "squash":
      return "squash";
    case "rebase":
      return "rebase";
    default:
      return undefined;
  }
}

interface DisplayNameEmail {
  name: string;
  email: string;
}

export function parseDisplayNameEmail(
  displayNameEmail: string
): DisplayNameEmail {
  // Parse the name and email address from a string in the following format
  // Display Name <email@address.com>
  const pattern = /^([^<]+)\s*<([^>]+)>$/i;

  // Check we have a match
  const match = displayNameEmail.match(pattern);
  if (!match) {
    throw new Error(
      `The format of '${displayNameEmail}' is not a valid email address with display name`
    );
  }

  // Check that name and email are not just whitespace
  const name = match[1].trim();
  const email = match[2].trim();
  if (!name || !email) {
    throw new Error(
      `The format of '${displayNameEmail}' is not a valid email address with display name`
    );
  }

  return { name, email };
}
