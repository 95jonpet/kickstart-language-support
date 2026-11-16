<div align="center">

<img src="https://raw.githubusercontent.com/95jonpet/kickstart-language-support/main/icon.png" width="140" />

# Kickstart Language Support

Support for Kickstart (`.ks`) files in Visual Studio Code

</div>

## Features

This extension adds the following features to Visual Studio Code:

- Syntax highlighting for `.ks` files.
- Linting for `.ks` files using `ksvalidator`.
- Completion support for `.ks` files.
- Snippets for commonly used sections in `.ks` files.

## Installing a linter

The `ksvalidator` linter can typically be installed using `dnf` or `yum` on RHEL-based distributions of Linux:

```bash
dnf install pykickstart
```

**Note:** The package may be called something different depending on distribution and repo.

For other Linux distributions, [pykickstart](https://pypi.org/project/pykickstart/) can be installed using Python 3 and `pip`:

```bash
python3 -m pip install pykickstart
```

## Associating file types

By default, this extension is only activated for kickstart files using the `.ks` file extension.

Kickstart syntax highlighting can be enabled for other file extensions using the `files.associations` configuration (available through _User Settings_) for VS Code:

```json
"files.associations": {
    "*.ks.template": "kickstart"
}
```

In this case, `kickstart` syntax is associated with files matching the `*.ks.template` pattern.
See [VS Code Language Identifiers](https://code.visualstudio.com/docs/languages/identifiers) for further reference.
