var languageClient = null;

var DEPENDENCY_SECTIONS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies"
];

function isPackageJson(editor) {
  var path = editor && editor.document && editor.document.path;
  return Boolean(path && nova.path.basename(path) === "package.json");
}

function dependencyOnSelectedLine(editor) {
  if (!isPackageJson(editor)) {
    return null;
  }

  var lineRange = editor.getLineRangeForRange(editor.selectedRange);
  var line = editor.getTextInRange(lineRange);
  var match = /^\s*"([^"]+)"\s*:\s*"([^"]*)"\s*,?\s*$/.exec(line);

  if (!match) {
    return null;
  }

  var packageName = match[1];
  var currentSpec = match[2];
  var documentText = editor.getTextInRange(new Range(0, editor.document.length));
  var packageJson;

  try {
    packageJson = JSON.parse(documentText);
  } catch (error) {
    return null;
  }

  var section = DEPENDENCY_SECTIONS.find(function (sectionName) {
    var dependencies = packageJson[sectionName];
    return dependencies &&
      typeof dependencies === "object" &&
      Object.prototype.hasOwnProperty.call(dependencies, packageName) &&
      dependencies[packageName] === currentSpec;
  });

  if (!section) {
    return null;
  }

  var colonIndex = line.indexOf(":");
  var quotedSpec = "\"" + currentSpec + "\"";
  var quotedSpecStart = line.indexOf(quotedSpec, colonIndex + 1);

  if (quotedSpecStart < 0) {
    return null;
  }

  return {
    name: packageName,
    spec: currentSpec,
    section: section,
    range: new Range(
      lineRange.start + quotedSpecStart + 1,
      lineRange.start + quotedSpecStart + 1 + currentSpec.length
    )
  };
}

function isRegistryVersionSpec(spec) {
  return !/^(?:workspace:|file:|link:|git(?:\+|:)|https?:|ssh:|github:|bitbucket:|gitlab:|npm:)/i.test(spec);
}

function updatedSpec(currentSpec, latestVersion) {
  if (currentSpec.charAt(0) === "^") {
    return "^" + latestVersion;
  }

  if (currentSpec.charAt(0) === "~") {
    return "~" + latestVersion;
  }

  return latestVersion;
}

function registryURL(packageName) {
  return "https://registry.npmjs.org/" + encodeURIComponent(packageName) + "/latest";
}

async function fetchLatestVersion(packageName) {
  var response = await fetch(registryURL(packageName), {
    headers: {
      "Accept": "application/json"
    }
  });

  if (!response.ok) {
    throw new Error("npm registry returned HTTP " + response.status);
  }

  var packageInfo = await response.json();

  if (!packageInfo || typeof packageInfo.version !== "string") {
    throw new Error("npm registry response did not include a version");
  }

  return packageInfo.version;
}

async function updateDependency(editor) {
  var dependency = dependencyOnSelectedLine(editor);

  if (!dependency) {
    nova.workspace.showWarningMessage(
      "Place the cursor on a dependency version in package.json."
    );
    return;
  }

  if (!isRegistryVersionSpec(dependency.spec)) {
    nova.workspace.showWarningMessage(
      dependency.name + " uses a local, workspace, URL, Git, or alias spec and was not changed."
    );
    return;
  }

  try {
    var latestVersion = await fetchLatestVersion(dependency.name);
    var replacement = updatedSpec(dependency.spec, latestVersion);

    if (replacement === dependency.spec) {
      nova.workspace.showInformativeMessage(
        dependency.name + " is already using " + replacement + "."
      );
      return;
    }

    if (editor.getTextInRange(dependency.range) !== dependency.spec) {
      nova.workspace.showWarningMessage(
        dependency.name + " changed while its latest version was being loaded. Nothing was updated."
      );
      return;
    }

    await editor.edit(function (edit) {
      edit.replace(dependency.range, replacement);
    });

    nova.workspace.showInformativeMessage(
      "Updated " + dependency.name + " from " + dependency.spec + " to " + replacement + "."
    );
  } catch (error) {
    nova.workspace.showErrorMessage(
      "Could not update " + dependency.name + ": " + error.message
    );
  }
}

exports.activate = function () {
  var serverPath = nova.path.join(nova.extension.path, "Scripts", "server.js");
  var serverOptions = {
    path: "/usr/bin/env",
    args: ["node", serverPath],
    env: nova.environment,
    type: "stdio"
  };
  var clientOptions = {
    syntaxes: [
      {
        syntax: "json",
        languageId: "json"
      }
    ]
  };

  languageClient = new LanguageClient(
    "package-peek",
    "Package Peek",
    serverOptions,
    clientOptions
  );

  nova.subscriptions.add(
    languageClient.onDidStop(function (error) {
      if (error) {
        console.error("Package Peek language server stopped: " + error);
      }
    })
  );

  nova.subscriptions.add(
    nova.commands.register(
      "com.stampmeister.package-peek.update-dependency",
      updateDependency
    )
  );

  languageClient.start();
};

exports.deactivate = function () {
  if (languageClient) {
    languageClient.stop();
    languageClient = null;
  }
};
