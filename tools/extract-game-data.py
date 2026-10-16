"""Read current Last Epoch assets into a private research directory.

Requires UnityPy and TypeTreeGeneratorAPI, plus Cpp2IL dll_empty output made
from the same game build. The game installation and saves are never written.
Usage: python tools/extract-game-data.py --game-dir ... --assemblies ... --out ...
Do not publish the raw output; the website only needs selected numeric facts.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--game-dir', type=Path, required=True)
    parser.add_argument('--assemblies', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--library-dir', type=Path)
    args = parser.parse_args()
    if args.library_dir:
        sys.path.insert(0, str(args.library_dir.resolve()))
    import UnityPy
    from TypeTreeGeneratorAPI import TypeTreeGenerator

    game = args.game_dir.resolve()
    out = args.out.resolve()
    if out == game or game in out.parents:
        raise ValueError('Output must be outside the game installation')
    out.mkdir(parents=True, exist_ok=True)
    data = game / 'Last Epoch_Data'
    env = UnityPy.load(str(data / 'resources.assets'))
    version = env.objects[0].assets_file.unity_version
    generator = TypeTreeGenerator(version, 'AssetStudio')
    for dll in args.assemblies.glob('*.dll'):
        generator.load_dll(dll.read_bytes())
    wanted = {'UniqueList', 'GlobalTreeData', 'IdolsContainerGridDataList'}
    found = []
    for obj in env.objects:
        if obj.type.name != 'MonoBehaviour':
            continue
        name = obj.peek_name()
        if name not in wanted:
            continue
        schema = json.loads(generator.get_nodes_as_json('LE.dll', name))
        result = obj.read_typetree(nodes=schema, check_read=True)
        (out / f'{name}.json').write_text(json.dumps(result, ensure_ascii=False), encoding='utf-8')
        (out / f'{name}.schema.json').write_text(json.dumps(schema), encoding='utf-8')
        found.append(name)
        print(f'{name}: verified exact object byte consumption', flush=True)

    bundle = data / 'StreamingAssets' / 'LEAssetBundles' / 'PermaLoad.bundle'
    env = UnityPy.load(str(bundle))
    wanted = {'MasterItemsList', 'MasterAffixesList', 'Global Tree Data'}
    for obj in env.objects:
        if obj.type.name != 'MonoBehaviour':
            continue
        name = obj.peek_name()
        if name not in wanted:
            continue
        result = obj.read_typetree(check_read=True)
        output_name = 'GlobalTreeData' if name == 'Global Tree Data' else name
        (out / f'{output_name}.json').write_text(json.dumps(result, ensure_ascii=False), encoding='utf-8')
        found.append(name)
        print(f'{name}: verified exact object byte consumption', flush=True)
    (out / 'extraction.json').write_text(json.dumps({
        'unityVersion': version,
        'gameBuildHash': (data / 'build_hash.txt').read_text().strip(),
        'objects': found,
    }, indent=2), encoding='utf-8')


if __name__ == '__main__':
    main()
