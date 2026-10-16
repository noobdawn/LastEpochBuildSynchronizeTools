"""Extract versioned rarity inputs for loot filters, not global drop probabilities.

Usage:
    python tools/extract-filter-rarity.py --csv-dir docs/data
    python tools/extract-filter-rarity.py --csv-dir docs/data --game-dir GAME_DIR \
        --frontend-out web/src/data/filter-catalog.json

The first command exports numeric research facts without localized strings.
The second also joins the installed game's official Chinese/English tables.

Inputs are privately extracted game assets. Only names, identifiers, weights,
eligibility flags and level inputs are published; item stats/lore are excluded.
Native-derived fields are gated on the game build whose functions were inspected.
"""

import argparse
from collections import Counter
import csv
import hashlib
import json
import math
from pathlib import Path
import re
import sys


ROOT = Path(__file__).resolve().parents[1]
VERIFIED_BUILDS = {
    "8dfd6929fe2d10f2e77b7ed4c8e6910f49b2736b": {
        "gameVersion": "1.5.2.1",
        "internalVersion": "1.5.2.2",
        "steamBuildId": "25816319",
        "gameAssemblySha256": "d5f9fb458f0e9878e697a92b590a586a52fd77e645f8bf87bb4f2b74c6c56567",
        "versionEvidence": "README.md baseline; extraction.json gameBuildHash",
        "nativeVerificationDate": "2026-10-16",
    }
}


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def unique_index(rows, key, context):
    result = {}
    for row in rows:
        identifier = row[key]
        if identifier in result:
            raise ValueError(f"Duplicate {context} {key}: {identifier}")
        result[identifier] = row
    return result


def enum_values(path, name):
    text = path.read_text(encoding="utf-8")
    match = re.search(r"\benum\s+" + re.escape(name) + r"\s*:[^{]+\{([^}]+)\}", text)
    if not match:
        raise ValueError(f"Cannot find enum {name} in {path}")
    values = {int(value): label for label, value in re.findall(
        r"\b([A-Za-z_][A-Za-z_0-9]*)\s*=\s*(-?\d+)\s*,", match[1]
    )}
    if not values:
        raise ValueError(f"Empty enum {name} in {path}")
    return values


def require_fields(rows, fields, context):
    for row in rows:
        absent = sorted(set(fields) - row.keys())
        if absent:
            raise ValueError(f"{context} is missing fields: {absent}")


def finite_nonnegative(value, context):
    if not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
        raise ValueError(f"Invalid {context}: {value!r}")


def histogram(rows, key):
    return {str(k): v for k, v in sorted(Counter(row[key] for row in rows).items())}


def read_localization(game_dir, library_dir=None):
    """Join Unity StringTable rows to SharedTableData keys from the same install."""
    if library_dir:
        sys.path.insert(0, str(library_dir.resolve()))
    import UnityPy

    directory = game_dir / "Last Epoch_Data/StreamingAssets/aa/StandaloneWindows64"
    filenames = {
        "keys": "localization-assets-shared_assets_all.bundle",
        "en": "localization-string-tables-english(en)_assets_all.bundle",
        "zh": "localization-string-tables-chinese(simplified)(zh)_assets_all.bundle",
    }
    tables = ("Item_Names", "Item_Affixes", "Common")
    keys, localized = {}, {"en": {}, "zh": {}}
    for locale, filename in filenames.items():
        environment = UnityPy.load(str(directory / filename))
        wanted = {f"{table} Shared Data" if locale == "keys" else f"{table}_{locale}": table
                  for table in tables}
        for asset in environment.objects:
            if asset.type.name != "MonoBehaviour":
                continue
            table = wanted.get(asset.peek_name())
            if table is None:
                continue
            content = asset.read_typetree(check_read=True)
            if locale == "keys":
                keys[table] = {entry["m_Id"]: entry["m_Key"] for entry in content["m_Entries"]}
            else:
                localized[locale][table] = {entry["m_Id"]: entry["m_Localized"]
                                            for entry in content["m_TableData"]}
    result = {}
    for locale in ("en", "zh"):
        result[locale] = {}
        for table in tables:
            if table not in keys or table not in localized[locale]:
                raise ValueError(f"Missing localization table {table}_{locale}")
            result[locale][table] = {key: localized[locale][table].get(entry_id)
                                      for entry_id, key in keys[table].items()}
    result["source"] = {
        "gameBuildHash": (game_dir / "Last Epoch_Data/build_hash.txt").read_text().strip(),
        "files": [{"file": filename, "sha256": sha256(directory / filename)}
                  for filename in filenames.values()],
        "tables": list(tables),
        "method": "Unity SharedTableData m_Entries key/id joined to StringTable m_TableData id/localized text; exact object consumption checked.",
    }
    return result


def clean_name(value):
    if not isinstance(value, str) or not value.strip():
        return None
    # Names in the game affix picker omit numeric roll placeholders.
    value = re.sub(r"\{\d+(?::[^}]*)?\}", "", value)
    value = re.sub(r"<[^>]+>", "", value)
    value = re.sub(r"\s+", " ", value).strip()
    return value or None


def localized_name(localization, table, key, english_fallback, alternate_key=None):
    names = {}
    for locale in ("zh", "en"):
        entries = (localization or {}).get(locale, {}).get(table, {})
        value = clean_name(entries.get(key))
        if not value and alternate_key:
            value = clean_name(entries.get(alternate_key))
        names[locale] = value or (clean_name(english_fallback) if locale == "en" else None)
    return names


def extract(input_dir, symbols_dir, localization=None):
    extraction = read_json(input_dir / "extraction.json")
    build_hash = extraction["gameBuildHash"]
    if build_hash not in VERIFIED_BUILDS:
        raise ValueError(
            f"Unverified game build {build_hash}. Recheck native-derived semantics "
            "and update VERIFIED_BUILDS before publishing a new catalog."
        )
    if localization and localization["source"]["gameBuildHash"] != build_hash:
        raise ValueError("Localization installation and extracted item data have different game builds")
    affix_source = read_json(input_dir / "MasterAffixesList.json")
    unique_source = read_json(input_dir / "UniqueList.json")["uniques"]
    base_source = read_json(input_dir / "MasterItemsList.json")["EquippableItems"]
    affix_source_rows = affix_source["singleAffixes"] + affix_source["multiAffixes"]
    unique_index(affix_source_rows, "affixId", "affix")
    unique_index(unique_source, "uniqueID", "unique")
    bases = unique_index(base_source, "baseTypeID", "base")
    subtypes = {base_id: unique_index(base["subItems"], "subTypeID", "subtype")
                for base_id, base in bases.items()}

    affix_cs = symbols_dir / "AffixList.cs"
    unique_cs = symbols_dir / "UniqueList.cs"
    equipment_cs = symbols_dir / "EquipmentType.cs"
    enums = {name: enum_values(affix_cs, name) for name in (
        "AffixType", "RollsOn", "SpecialAffixType", "ClassSpecificity", "T6Compatibility"
    )}
    enums["LegendaryType"] = enum_values(unique_cs, "LegendaryType")
    enums["EquipmentType"] = enum_values(equipment_cs, "EquipmentType")

    affix_raw_fields = (
        "affixId", "weighting", "type", "rollsOn", "specialAffixType", "classSpecificity",
        "levelRequirement", "canRollOn", "specificRerollChances", "uniqueId",
        "t6Compatibility", "maximumAffixEffectModifierForT6",
        "convertOnIncompatibleItemType", "affixIDToConvertTo",
    )
    unique_raw_fields = (
        "uniqueID", "baseType", "subTypes", "isSetItem", "setID", "unifiedType",
        "rerollChance", "canDropRandomly", "hideFromPlayers",
        "overrideLevelRequirement", "levelRequirement", "useCustomDropLevel", "customDropLevel",
        "legendaryType", "overrideEffectiveLevelForLegendaryPotential",
        "effectiveLevelForLegendaryPotential", "isPrimordialItem", "isCocoonedItem",
        "isPreCorrupted", "canDropAsLegendary", "dropsSpecificLegendaryAffixes",
        "droppableLegendaryAffixCount", "droppableLegendaryAffixes",
    )
    require_fields(affix_source_rows, affix_raw_fields + ("affixName", "tiers"), "affix")
    require_fields(unique_source, unique_raw_fields + ("name", "displayName"), "unique")

    affixes = []
    duplicate_overrides = []
    override_outside_types = []
    for raw in sorted(affix_source_rows, key=lambda x: x["affixId"]):
        affix_id = raw["affixId"]
        finite_nonnegative(raw["weighting"], f"affix {affix_id} weighting")
        for field, enum_name in (
            ("type", "AffixType"), ("rollsOn", "RollsOn"),
            ("specialAffixType", "SpecialAffixType"), ("t6Compatibility", "T6Compatibility"),
        ):
            if raw[field] not in enums[enum_name]:
                raise ValueError(f"Unknown affix {field}: {raw[field]}")
        for equipment_type in raw["canRollOn"]:
            if equipment_type not in enums["EquipmentType"]:
                raise ValueError(f"Unknown equipment type {equipment_type}")
        first_overrides = {}
        for override in raw["specificRerollChances"]:
            require_fields([override], ("equipmentType", "weighting", "rerollChance"), "override")
            eq_type = override["equipmentType"]
            finite_nonnegative(override["weighting"], f"affix {affix_id} override weighting")
            if eq_type in first_overrides:
                duplicate_overrides.append({"affixId": affix_id, "equipmentType": eq_type})
            else:
                first_overrides[eq_type] = override["weighting"]
            if eq_type not in raw["canRollOn"]:
                override_outside_types.append({"affixId": affix_id, "equipmentType": eq_type})
        item = {field: raw[field] for field in affix_raw_fields}
        item["name"] = raw["affixName"]
        display_key = f"Item_Affix_{affix_id}_DisplayName"
        name_key = f"Item_Affix_{affix_id}_FilterOverride" if raw.get("affixLootFilterOverrideName") else display_key
        item["localizedName"] = localized_name(
            localization, "Item_Affixes", name_key,
            raw.get("affixLootFilterOverrideName") or raw.get("affixDisplayName") or raw["affixName"],
            display_key,
        )
        item["displayCategory"] = raw["displayCategory"]
        item["tierCount"] = len(raw["tiers"])
        item["derived"] = {
            "ordinaryDropAffix": raw["specialAffixType"] == 0,
            "hasShard": raw["rollsOn"] == 0 and raw["specialAffixType"] in (0, 3)
                        and raw["canRollOn"] != [41],
            "effectiveWeightByEquipmentType": {
                str(eq): first_overrides.get(eq, raw["weighting"])
                for eq in raw["canRollOn"]
            },
        }
        affixes.append(item)

    uniques = []
    for raw in sorted(unique_source, key=lambda x: x["uniqueID"]):
        unique_id = raw["uniqueID"]
        finite_nonnegative(raw["rerollChance"], f"unique {unique_id} rerollChance")
        if raw["rerollChance"] > 1:
            raise ValueError(f"Unique {unique_id} rerollChance exceeds 1")
        if not raw["subTypes"]:
            raise ValueError(f"Unique {unique_id} has no subtypes")
        if raw["legendaryType"] not in enums["LegendaryType"]:
            raise ValueError(f"Unknown legendary type {raw['legendaryType']}")
        item = {field: raw[field] for field in unique_raw_fields}
        item["name"] = raw["displayName"] or raw["name"]
        item["localizedName"] = localized_name(
            localization, "Item_Names", f"Unique_Name_{unique_id}", item["name"])
        levels = {}
        lp_levels = {}
        for subtype in raw["subTypes"]:
            base = subtypes[raw["baseType"]][subtype]
            level = raw["levelRequirement"] if raw["overrideLevelRequirement"] else base["levelRequirement"]
            levels[str(subtype)] = max(0, min(255, level))
            lp_levels[str(subtype)] = raw["effectiveLevelForLegendaryPotential"] if raw[
                "overrideEffectiveLevelForLegendaryPotential"] else levels[str(subtype)]
        item["derived"] = {
            "levelRequirementBySubtype": levels,
            "effectiveLevelForLegendaryPotentialBySubtype": lp_levels,
            "minimumLevelForEntryCanDropAtLevel": raw["customDropLevel"] if raw[
                "useCustomDropLevel"] else min(levels.values()),
        }
        uniques.append(item)

    input_files = ["extraction.json", "MasterAffixesList.json", "UniqueList.json", "MasterItemsList.json"]
    files = [{"file": name, "sha256": sha256(input_dir / name)} for name in input_files]
    schema_path = input_dir / "UniqueList.schema.json"
    if schema_path.exists():
        files.append({"file": schema_path.name, "sha256": sha256(schema_path)})
    for cs_path in [affix_cs, unique_cs, equipment_cs, symbols_dir / "ItemList.cs"]:
        files.append({"file": "game-cs/DiffableCs/LE/" + cs_path.name, "sha256": sha256(cs_path)})
    rng_cs = symbols_dir.parent / "LE.Core/LE/Core/RngElement.cs"
    files.append({"file": "game-cs/DiffableCs/LE.Core/LE/Core/RngElement.cs", "sha256": sha256(rng_cs)})

    counts = {
        "affixes": len(affixes), "singleAffixes": len(affix_source["singleAffixes"]),
        "multiAffixes": len(affix_source["multiAffixes"]),
        "standardEquipmentAffixes": sum(x["rollsOn"] == 0 and x["specialAffixType"] == 0 for x in affixes),
        "standardIdolAffixes": sum(x["rollsOn"] == 1 and x["specialAffixType"] == 0 for x in affixes),
        "affixesWithShard": sum(x["derived"]["hasShard"] for x in affixes),
        "affixesWithEquipmentOverrides": sum(bool(x["specificRerollChances"]) for x in affixes),
        "affixWeightAboveOne": sum(x["weighting"] > 1 for x in affixes),
        "affixSpecialTypes": histogram(affixes, "specialAffixType"),
        "uniqueListEntries": len(uniques),
        "uniqueItems": sum(not x["isSetItem"] for x in uniques),
        "setItems": sum(x["isSetItem"] for x in uniques),
        "randomDropEntries": sum(x["canDropRandomly"] for x in uniques),
        "nonRandomDropEntries": sum(not x["canDropRandomly"] for x in uniques),
        "hiddenEntries": sum(x["hideFromPlayers"] for x in uniques),
        "lpLevelOverrides": sum(x["overrideEffectiveLevelForLegendaryPotential"] for x in uniques),
        "customDropLevelEntries": sum(x["useCustomDropLevel"] for x in uniques),
        "weaversWillEntries": sum(x["legendaryType"] == 1 for x in uniques),
        "primordialEntries": sum(x["isPrimordialItem"] for x in uniques),
        "cocoonedEntries": sum(x["isCocoonedItem"] for x in uniques),
    }
    return {
        "schemaVersion": 2,
        "source": {
            **VERIFIED_BUILDS[build_hash], "gameBuildHash": build_hash,
            "unityVersion": extraction["unityVersion"], "files": files,
            "localization": localization["source"] if localization else None,
            "nativeVerification": {
                "Affix.GetWeighting": "RVA 0x11B2D00: first matching equipment override weighting; otherwise base weighting",
                "Affix.GetEffectiveDefaultRerollChanceFromWeighting": "RVA 0x11B2740: max(0, 1 - weighting)",
                "Affix.IsDroppable": "RVA 0x11B3D50: specialAffixType == Standard",
                "Affix.HasShard": "RVA 0x11B3CC0: Equipment and Standard/Set; excludes canRollOn == [IDOL_ALTAR]",
                "UniqueList.Entry.getEffectiveLevelForLegendaryPotential": "RVA 0x125A9F0: override value or getLevelRequirement(subtype)",
                "UniqueList.Entry.getLevelRequirement": "RVA 0x125AB30: override value or ItemList.GetItemLevelRequirement(baseType, subtype), clamped to byte",
                "ItemList.GetItemLevelRequirement": "RVA 0x1226720: matching subtype levelRequirement",
                "UniqueList.Entry.CanDropAtLevel": "RVA 0x1259BC0: customDropLevel if enabled; otherwise any eligible subtype level requirement",
                "UniqueList.Entry.hasLevelRequirementAtOrBelow": "RVA 0x125ADF0: override level or any subtype level at/below requested level",
                "UniqueList.rollUnique": "RVA 0x1270F10: builds an eligible candidate list, selects a candidate, reads rerollChance at 0x1271370, and calls RngElement.Roll at 0x12713F2. A successful roll rejects the candidate: failOnReroll returns failure; otherwise it resamples. After 60 rejections the last resampled candidate is returned without another rejection check. Optional weight compression can replace the raw reroll chance.",
                "RngElement.Roll": "RVA 0xF6A6D0: compares chance with a 0..1 pseudorandom float; chance <= 0 returns false and chance >= 1 returns true. The 1.0 float constant was checked in the binary.",
                "UniqueList.ApplyUniqueWeightCompression": "RVA 0x126E1A0; equivalent conditional compression logic is inlined in rollUnique at 0x1271394..0x12713D9. It depends on ItemRollModifiers and failOnReroll. No compressed probability formula is modeled by this extractor.",
            },
        },
        "interpretation": {
            "rawFields": "Original field names and numeric values are retained, apart from the display name fallback and tierCount summary.",
            "affixWeighting": "Relative selection weight within an eligible pool. Use per-equipment weighting. Values can exceed 1; not a probability.",
            "specificRerollChance": "Preserved legacy-named raw field; verified GetWeighting uses weighting, not rerollChance. Duplicate overrides use the first occurrence.",
            "ordinaryDropAffix": "Matches the native IsDroppable property only. Special sources can produce Experimental, Personal, Set, etc.; false does not mean unobtainable.",
            "uniqueRerollChance": "Raw candidate rejection/reroll input in the verified rollUnique path. With no weight compression and after a candidate has already been selected, 0.98 means approximately 98% rejection and 2% acceptance in that one check. Higher values reject more often under the same candidate environment. Rejection either fails the operation (failOnReroll) or selects another candidate; the latter path caps rejection checks at 60 and returns the last resampled candidate. Candidate eligibility, optional weight compression, callers and this cap prevent treating 1-rerollChance as a global or exact final-pool probability. In particular, 0.98 does not mean a 2% monster/boss/run drop chance. No global probability, unique rarity tier, or market value is assigned.",
            "nonRandomUnique": "canDropRandomly=false identifies absence from the random-drop pool; it does not identify the boss, quest, craft, vendor or other acquisition source.",
            "lpLevel": "Resolved per subtype with the verified override/fallback. Separate from unique drop rarity and actual LP count; also used by Weaver's Will. No LP probability or LP eligibility is inferred here.",
            "minimumLevelForEntryCanDropAtLevel": "Only the UniqueList.Entry level gate, not a complete area/boss/faction/difficulty drop condition.",
            "tierCount": "Count of serialized tier definitions, not a declaration that every tier drops naturally or can be forged.",
            "names": "name preserves the original English research label. localizedName contains official game zh/en strings joined by ID; affixes prefer the enabled filter override then display name. Numeric value placeholders and rich-text tags are removed. Missing Chinese is null and must fall back visibly to English, never an invented translation.",
        },
        "coverage": {
            "dropSources": "not extracted: boss/quest/vendor/encounter tables, per-source chances, difficulty/corruption requirements",
            "probabilities": "not calculated: global drops, affix tier drops, joint affix combinations, LP/WW distributions",
            "missingRawRequiredFields": [],
            "duplicateAffixEquipmentOverrides": duplicate_overrides,
            "affixOverridesOutsideCanRollOn": override_outside_types,
            "hiddenUniqueIds": [x["uniqueID"] for x in uniques if x["hideFromPlayers"]],
            "nonzeroInactiveLpOverrideIds": [x["uniqueID"] for x in uniques if not x[
                "overrideEffectiveLevelForLegendaryPotential"] and x["effectiveLevelForLegendaryPotential"] != 0],
            "localization": {
                "affixesZh": sum(bool(x["localizedName"]["zh"]) for x in affixes),
                "uniquesZh": sum(bool(x["localizedName"]["zh"]) for x in uniques),
                "missingAffixZhIds": [x["affixId"] for x in affixes if not x["localizedName"]["zh"]],
                "missingUniqueZhIds": [x["uniqueID"] for x in uniques if not x["localizedName"]["zh"]],
            },
        },
        "counts": counts, "enums": enums,
        "affixes": affixes, "uniques": uniques,
    }


def write_json(path, data):
    # One entry per line keeps the machine-readable catalog compact and reviewable.
    metadata = {key: value for key, value in data.items() if key not in ("affixes", "uniques")}
    text = json.dumps(metadata, ensure_ascii=False, indent=2)[:-2]
    for key in ("affixes", "uniques"):
        text += ',\n  "' + key + '": [\n'
        text += ",\n".join("    " + json.dumps(row, ensure_ascii=False, separators=(",", ":")) for row in data[key])
        text += "\n  ]"
    text += "\n}\n"
    # Validate serialization before replacing an existing file.
    assert json.loads(text) == json.loads(json.dumps(data))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def write_csv(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    # BOM makes names readable when this research sheet is opened in Windows Excel.
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def export_csv(directory, data):
    enums = data["enums"]
    affixes = []
    for row in data["affixes"]:
        affixes.append({
            "affixId": row["affixId"], "name": row["name"],
            "nameZh": row["localizedName"]["zh"], "nameEn": row["localizedName"]["en"],
            "type": enums["AffixType"][row["type"]],
            "rollsOn": enums["RollsOn"][row["rollsOn"]],
            "specialAffixType": enums["SpecialAffixType"][row["specialAffixType"]],
            "weightingRaw": row["weighting"],
            "effectiveWeightByEquipmentType": "; ".join(
                f"{enums['EquipmentType'][int(eq)]}={value}"
                for eq, value in row["derived"]["effectiveWeightByEquipmentType"].items()),
            "classSpecificityMask": row["classSpecificity"], "levelRequirement": row["levelRequirement"],
            "hasShard": row["derived"]["hasShard"], "ordinaryDropAffix": row["derived"]["ordinaryDropAffix"],
            "tierDefinitionCount": row["tierCount"],
        })
    unique_rows = []
    for row in data["uniques"]:
        unique_rows.append({
            "uniqueID": row["uniqueID"], "name": row["name"], "isSetItem": row["isSetItem"],
            "nameZh": row["localizedName"]["zh"], "nameEn": row["localizedName"]["en"],
            "baseType": enums["EquipmentType"][row["baseType"]],
            "subTypes": ";".join(str(x) for x in row["subTypes"]),
            "rerollChanceRaw": row["rerollChance"], "canDropRandomly": row["canDropRandomly"],
            "hideFromPlayers": row["hideFromPlayers"],
            "minimumLevelForEntryCanDropAtLevel": row["derived"]["minimumLevelForEntryCanDropAtLevel"],
            "legendaryType": enums["LegendaryType"][row["legendaryType"]],
            "resolvedEffectiveLpLevelBySubtype": "; ".join(f"{key}={value}" for key, value in row[
                "derived"]["effectiveLevelForLegendaryPotentialBySubtype"].items()),
            "isPrimordialItem": row["isPrimordialItem"], "isCocoonedItem": row["isCocoonedItem"],
            "isPreCorrupted": row["isPreCorrupted"], "canDropAsLegendary": row["canDropAsLegendary"],
            "dropsSpecificLegendaryAffixes": row["dropsSpecificLegendaryAffixes"],
        })
    write_csv(directory / "filter-affix-rarity.csv", affixes)
    write_csv(directory / "filter-unique-rarity.csv", unique_rows)


def frontend_catalog(data, input_dir, localization):
    """Small browser lookup with official names; raw game IDs remain authoritative."""
    if not localization:
        raise ValueError("Frontend catalog requires --game-dir for verified localization")
    source_bases = read_json(input_dir / "MasterItemsList.json")["EquippableItems"]
    affix_meta = read_json(input_dir / "MasterAffixesList.json")
    categories = affix_meta["affixDisplayCategories"]
    types, bases = {}, {}
    for base in source_bases:
        base_id = base["baseTypeID"]
        if base_id != base["type"]:
            raise ValueError("Base ID and EquipmentType mapping changed; recheck frontend consumers")
        types[str(base_id)] = {
            "id": base_id, "filterEquipmentType": base["type"],
            "name": localized_name(localization, "Item_Names", f"Item_BaseType_Name_{base_id}",
                                   base.get("displayName") or base["BaseTypeName"] or "Unused"),
            "obsolete": bool(base["obsoleteItemType"]),
        }
        for sub in base["subItems"]:
            sub_id = sub["subTypeID"]
            bases[f"{base_id}:{sub_id}"] = {
                "baseType": base_id, "subType": sub_id,
                "name": localized_name(localization, "Item_Names", f"Item_SubType_Name_{base_id}_{sub_id}",
                                       sub.get("displayName") or sub["name"] or f"{base_id}:{sub_id}"),
                "hideInFilter": bool(sub["hideSubTypeInLootFilter"]),
                "legacy": bool(sub["isLegacySubType"]), "canDrop": not bool(sub["cannotDrop"]),
                "classRequirement": sub["classRequirement"],
                "subClassRequirement": sub["subClassRequirement"],
            }
    affixes = {}
    for row in data["affixes"]:
        category = categories[row["displayCategory"]]
        category_name = localized_name(localization, "Item_Affixes", f"Affix_Category_{category}", category)
        common_category = localized_name(localization, "Common", f"Affix_Category_{category}", category)
        category_name["zh"] = category_name["zh"] or common_category["zh"]
        affixes[str(row["affixId"])] = {
            "id": row["affixId"], "name": row["localizedName"], "internalName": row["name"],
            **{key: row[key] for key in ("type", "rollsOn", "specialAffixType", "classSpecificity", "canRollOn", "weighting", "tierCount", "levelRequirement", "displayCategory")},
            "standard": row["derived"]["ordinaryDropAffix"], "hasShard": row["derived"]["hasShard"],
            "effectiveWeightByType": row["derived"]["effectiveWeightByEquipmentType"],
            "displayCategoryName": category_name,
        }
    uniques = {}
    for row in data["uniques"]:
        uniques[str(row["uniqueID"])] = {
            "id": row["uniqueID"], "name": row["localizedName"],
            **{key: row[key] for key in ("baseType", "subTypes", "isSetItem", "legendaryType", "rerollChance", "canDropRandomly", "hideFromPlayers", "isPrimordialItem", "isCocoonedItem", "isPreCorrupted", "dropsSpecificLegendaryAffixes")},
            "effectiveLpLevelBySubtype": row["derived"]["effectiveLevelForLegendaryPotentialBySubtype"],
        }
    return {
        "schemaVersion": 1,
        "source": {key: data["source"][key] for key in ("gameVersion", "internalVersion", "gameBuildHash", "localization")},
        "localizationCoverage": {
            **data["coverage"]["localization"],
            "typesZh": sum(bool(row["name"]["zh"]) for row in types.values()),
            "basesZh": sum(bool(row["name"]["zh"]) for row in bases.values()),
            "missingTypeZhIds": [row["id"] for row in types.values() if not row["name"]["zh"]],
            "missingBaseZhIds": [key for key, row in bases.items() if not row["name"]["zh"]],
        },
        "types": types, "bases": bases, "affixes": affixes, "uniques": uniques,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=ROOT / ".local/research/game-data")
    parser.add_argument("--symbols", type=Path, help="Directory containing AffixList.cs, UniqueList.cs and EquipmentType.cs")
    parser.add_argument("--output", type=Path, default=ROOT / "docs/data/filter-rarity-data.json")
    parser.add_argument("--csv-dir", type=Path, help="Also export readable affix and unique CSV files")
    parser.add_argument("--game-dir", type=Path, help="Installed game directory, to extract official Chinese and English names")
    parser.add_argument("--library-dir", type=Path, default=ROOT / ".local/research/pylibs", help="Optional UnityPy library directory")
    parser.add_argument("--frontend-out", type=Path, help="Also export the compact bilingual browser catalog; requires --game-dir")
    args = parser.parse_args()
    symbols = args.symbols or args.input.parent / "game-cs/DiffableCs/LE"
    localization = read_localization(args.game_dir, args.library_dir) if args.game_dir else None
    data = extract(args.input, symbols, localization)
    frontend = frontend_catalog(data, args.input, localization) if args.frontend_out else None
    write_json(args.output, data)
    if args.csv_dir:
        export_csv(args.csv_dir, data)
    if frontend is not None:
        args.frontend_out.parent.mkdir(parents=True, exist_ok=True)
        args.frontend_out.write_text(json.dumps(frontend, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(args.output), **data["counts"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
