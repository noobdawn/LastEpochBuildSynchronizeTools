# Dependencies and data provenance

The web interface and conversion modules are implemented in this repository. They do not bundle LastEpochTools' JavaScript, stylesheets, artwork, or planner application.

| Component | Source | Role |
| --- | --- | --- |
| lossless-json | https://github.com/josdejong/lossless-json | Exact JSON number preservation; MIT |
| fflate | https://github.com/101arrowz/fflate | ZIP creation; MIT |
| lz-string | https://github.com/pieroxy/lz-string | Compressed public item identifiers; MIT |
| Vite | https://github.com/vitejs/vite | Development and static builds; MIT |
| LastEpochTools public build endpoint | https://www.lastepochtools.com/api/public/build_data/om6w3Ypq | Read-only build input; separate service whose availability may change |
| Local Last Epoch installation | Game 1.5.2.1 / internal 1.5.2.2, Steam build 25816319 | Item IDs, names, dimensions, node limits, unlock rules and save-format facts |

Package license texts are available in the installed dependencies. The static build includes license notices in `licenses.txt`. The game catalogs contain selected facts needed by this converter. Raw game assemblies, textures, bundles, decompiled files, tool binaries and private saves are excluded from source and deployment. Game and third-party marks remain the property of their owners. Extracting these facts does not grant a license to redistribute the original game or planner assets.

The public regression fixture is the user-supplied build `om6w3Ypq`. Tests use synthetic saves; optional real-save tests read ignored local copies. No private save belongs in the repository.

The runtime decodes the compressed item identifiers directly and validates them against the extracted game catalog. It does not depend on copied planner JavaScript or a manually maintained website ID mapping table.
