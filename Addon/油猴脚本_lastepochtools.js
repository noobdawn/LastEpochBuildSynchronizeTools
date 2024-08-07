// ==UserScript==
// @name         最后纪元配装器数据导出-LastEpochTools
// @namespace    http://tampermonkey.net/
// @version      2024-04-15
// @description  try to take over the world!
// @author       You
// @match        https://www.lastepochtools.com/planner/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=lastepochtools.com
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const DEBUFF_NAMES = [
        "Mana Cost for Detonating Arrow",
        "Current Health and Ward lost when you directly cast a Spell",
    ]

    // 找到<div class="logo-text">最后纪元BD配装器</div>
    const Logotext = document.querySelector('.logo-text');

    // 创建一个新的按钮
    const exportButton = document.createElement('button');
    exportButton.textContent = '复制BD数据到剪贴板';

    // 将复制的按钮放到原始按钮的下方
    Logotext.parentNode.appendChild(exportButton);

    // 移除Logotext.parentNode的href属性
    Logotext.parentNode.parentNode.removeAttribute('href');

    // 添加点击事件
    exportButton.addEventListener('click', function() {
        const res = le_work(window.buildInfo.data);

        // 将输出的文字复制到剪贴板
        navigator.clipboard.writeText(res).then(function() {
            // 弹窗提示
            alert('已复制到剪贴板');
        }, function(err) {
            // 弹窗提示
            alert('复制失败');
        });
    });

    // 替换原始按钮
    originalButton.parentNode.replaceChild(exportButton, originalButton);

    function get_value_from_tier(tier) {
        return (tier - 1) * 16;
    }

    function get_container_id(typestr) {
        switch (typestr) {
            case "weapon1":
                return 4;
            case "weapon2":
                return 5;
            case "head":
                return 2;
            case "chest":
                return 3;
            case "hands":
                return 6;
            case "feet":
                return 8;
            case "waist":
                return 7;
            case "ring1":
                return 10;
            case "ring2":
                return 9;
            case "amulet":
                return 11;
            case "relic":
                return 12;
            case "idol":
                return 29;
        }
    }

    function isDebuffMod(mod) {
        const prop_name = $db.getTaggedPropertyString(mod.property, mod.tags, mod.specialTag).trim();
        console.log(prop_name);
        let found = false;
        $.each(DEBUFF_NAMES, function(e, f) {
            // 判定是否为debuff
            if (f === prop_name)
                found = true;
        });
        return found;
    }

    function le_work(a){
        const output = {};

        // 处理祝福
        output["blessing"] = {};
        const d = a.blessings;
        $.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], function(e, f) {
            null == d[f] && (d[f] = null)
        });
        $.each(d, function(e, f) {
            if (f) {
                const g = {};
                $.isPlainObject(f) ? (g.item = f.id && le__j(f.id),
                g.Xa = f.ir) : (g.item = f && le__j(f),
                g.Xa = []);
                le_jj("blessing", g, e)
            }
        });

        output["class"] = a.bio.characterClass;
        output["mastery"] = a.bio.chosenMastery;

        output["chartree"] = a.charTree.selected;
        output["skilltrees"] = a.skillTrees;
        output["hud"] = a.hud;

        // 处理神像
        output["idols"] = [];
        let idx = 0;
        $.each(a.idols, function(e, f) {
            e = f.x;
            const g = f.y
              , k = {};
            k.item = f.id && le__j(f.id);
            var m = le_1j(f.affixes);
            const p = m.xg;
            m = m.suffixes;
            p[0] && (k.M = p[0].data,
            k.na = p[0].ib,
            k.pb = p[0].Ob);
            m[0] && (k.N = m[0].data,
            k.oa = m[0].ib,
            k.qb = m[0].Ob);
            k.Xa = f.ir;
            k.Za = f.ur;
            le_ij(k, e, g, !0)

            // 神像处理
            output["idols"][idx] = {};
            output["idols"][idx]["itemData"] = null;
            let isUnique = false;
            // 是传奇神像吗
            if (k.item.uniqueId)
                isUnique = true;
            // 基类
            output["idols"][idx]["data"] = [2, k.item.baseTypeId, k.item.subTypeId]
            output["idols"][idx]["data"][3] = isUnique ? 7 : 2;
            output["idols"][idx]["data"][4] = 128;
            output["idols"][idx]["data"][5] = 255;
            output["idols"][idx]["data"][6] = 255;
            output["idols"][idx]["data"][7] = 255;
            if (isUnique){
                output["idols"][idx]["data"][8] = (k.item.uniqueId - k.item.uniqueId % 256) / 256;
                output["idols"][idx]["data"][9] = k.item.uniqueId % 256;
                output["idols"][idx]["data"][10] = 255;
                output["idols"][idx]["data"][11] = 255;
                output["idols"][idx]["data"][12] = 255;
                output["idols"][idx]["data"][13] = 255;
                output["idols"][idx]["data"][14] = 255;
                output["idols"][idx]["data"][15] = 255;
                output["idols"][idx]["data"][16] = 255;
                output["idols"][idx]["data"][17] = 255;
                output["idols"][idx]["data"][18] = 4;   // 4个潜能空位
            }
            else{
                output["idols"][idx]["data"][8] = 20;
                var affix_count = 0;
                if (k.M)
                    affix_count++;
                if (k.N)
                    affix_count++;
                output["idols"][idx]["data"][9] = affix_count;
                if (k.M) {
                    output["idols"][idx]["data"][10] = 96 + (k.M.affixId - k.M.affixId % 256) / 256;
                    output["idols"][idx]["data"][11] = k.M.affixId % 256;
                    output["idols"][idx]["data"][12] = 255;
                }
                if (k.N) {
                    output["idols"][idx]["data"][13] = 96 + (k.N.affixId - k.N.affixId % 256) / 256;
                    output["idols"][idx]["data"][14] = k.N.affixId % 256;
                    output["idols"][idx]["data"][15] = 255;
                }
                output["idols"][idx]["data"][16] = 0;
            }
            output["idols"][idx]["quantity"] = 1;
            output["idols"][idx]["containerID"] = get_container_id("idol");
            output["idols"][idx]["formatVersion"] = 2;
            // 根据id计算神像大小和位置
            let width = 1;
            let height = 1;
            if (k.item.baseTypeId == 27)
                width = 2;
            if (k.item.baseTypeId == 28)
                height = 2;
            if (k.item.baseTypeId == 29)
                width = 3;
            if (k.item.baseTypeId == 30)
                height = 3;
            if (k.item.baseTypeId == 31)
                width = 4;
            if (k.item.baseTypeId == 32)
                height = 4;
            if (k.item.baseTypeId == 33){
                width = 2;
                height = 2;
            }
            let x = f.x - 1;
            let y = 5 - (f.y + (height - 1));
            output["idols"][idx]["inventoryPosition"] = {"x":x,"y":y};
            idx++;
        });

        idx = 0;
        output["equipment"] = [];
        const c = a.equipment;
        $.each(le_ti, function(e) {
            c[e] || (c[e] = {})
        });
        delete c.idol;
        delete c.blessing;
        $db.is2hItem(c.weapon1 && c.weapon1.id && le__j(c.weapon1.id)) && delete c.weapon2;
        $.each(c, function(e, f) {
            let g = {};
            g.item = f.id && le__j(f.id);
            var k = le_1j(f.affixes)
            , m = k.xg;
            const p = k.suffixes;
            k = null;
            m[0] && (g.M = m[0].data,
            g.na = m[0].ib,
            g.pb = m[0].Ob,
            g.M && 2 == g.M.specialAffixType && (k = g.M.id));
            m[1] && (g.W = m[1].data,
            g.Ca = m[1].ib,
            g.Mc = m[1].Ob,
            g.W && 2 == g.W.specialAffixType && (k = g.W.id));
            p[0] && (g.N = p[0].data,
            g.oa = p[0].ib,
            g.qb = p[0].Ob,
            g.N && 2 == g.N.specialAffixType && (k = g.N.id));
            p[1] && (g.Z = p[1].data,
            g.Da = p[1].ib,
            g.Tc = p[1].Ob,
            g.Z && 2 == g.Z.specialAffixType && (k = g.Z.id));
            f.sealedAffix && (m = le_2j(f.sealedAffix),
            g.X = m.data,
            g.Fa = m.ib,
            g.Oc = m.Ob,
            g.X && 2 == g.X.specialAffixType && (k = g.X.id));
            g.Xa = f.ir;
            g.Za = f.ur;
            g.xc = f.faction;
            g.item && null != k && (f = $db.Of(g.item.baseTypeId, g.item.subTypeId, k)) && (le_gj(f, g),
            g = f);
            le_kj(e, g)

            if (g.item)
            {
                // 判断传奇
                output["equipment"][idx] = {};
                output["equipment"][idx]["itemData"] = null;
                let isUnique = false;
                // 如果g.item.uniqueId存在且不为空字典
                if (g.item.uniqueId)
                    isUnique = true;
                let isSet = false;
                if (g.item.isSetItem == 1)
                    isSet = true;
                output["equipment"][idx]["data"] = [2, g.item.baseTypeId, g.item.subTypeId]
                // todo, 判断稀有度，4为普通装，7为传奇，8为套装，9为红色
                let rarity = g.item.rarity;
                if (isSet)
                    rarity = 8;
                else if (!isUnique)
                    rarity = 4;
                else if (f.affixes.length == 0)
                    rarity = 7;
                else
                    rarity = 9;
                output["equipment"][idx]["data"][3] = rarity;
                // 基底属性Roll值
                output["equipment"][idx]["data"][4] = 128;
                output["equipment"][idx]["data"][5] = 255;
                output["equipment"][idx]["data"][6] = 255;
                output["equipment"][idx]["data"][7] = 255;
                let affix_id = 0;
                let affix_start = 0;
                if (isUnique)
                {
                    // 传奇主副ID
                    output["equipment"][idx]["data"][8] = (g.item.uniqueId - g.item.uniqueId % 256) / 256;
                    output["equipment"][idx]["data"][9] = g.item.uniqueId % 256;
                    // 固有属性Roll值
                    for (let i = 0; i < 8; i++)
                        output["equipment"][idx]["data"][10 + i] = 255;
                    $.each(g.item.mods, function(e, f) {
                        if (f.canRoll == 1 && isDebuffMod(f))
                        {
                            const rollId = f.rollId;
                            output["equipment"][idx]["data"][10 + rollId] = 1;
                        }
                    });
                    // 传奇潜能数
                    output["equipment"][idx]["data"][18] = f.affixes.length;
                    affix_start = 19;
                }
                else
                {
                    // 锻造潜能
                    output["equipment"][idx]["data"][8] = 255;
                    // 封印词缀
                    let isSealed = false;
                    if (f.sealedAffix != null)
                        isSealed = true;
                    let affixes_count = f.affixes.length;
                    if (isSealed)
                        affixes_count++;
                    if (affixes_count >= 5)
                        affixes_count = 133
                    output["equipment"][idx]["data"][9] = affixes_count;
                    if (isSealed)
                    {
                        output["equipment"][idx]["data"][10] = get_value_from_tier(f.sealedAffix.tier) + (g.X.affixId - g.X.affixId % 256) / 256;
                        output["equipment"][idx]["data"][11] = g.X.affixId % 256;
                        output["equipment"][idx]["data"][12] = 255;
                        affix_start = 13;
                    }
                    else
                        affix_start = 10;
                }
                if (g.M){
                    output["equipment"][idx]["data"][affix_start + affix_id * 3] = get_value_from_tier(parseInt(f.affixes[affix_id].tier)) + (g.M.affixId - g.M.affixId % 256) / 256;
                    output["equipment"][idx]["data"][affix_start + affix_id * 3 + 1] = g.M.affixId % 256;
                    output["equipment"][idx]["data"][affix_start + affix_id * 3 + 2] = 255;
                    affix_id++;
                }
                if (g.W) {
                    output["equipment"][idx]["data"][affix_start + affix_id * 3] = get_value_from_tier(parseInt(f.affixes[affix_id].tier)) + (g.W.affixId - g.W.affixId % 256) / 256;
                    output["equipment"][idx]["data"][affix_start + affix_id * 3 + 1] = g.W.affixId % 256;
                    output["equipment"][idx]["data"][affix_start + affix_id * 3 + 2] = 255;
                    affix_id++;
                }
                if (g.N) {
                    output["equipment"][idx]["data"][affix_start + affix_id * 3] = get_value_from_tier(parseInt(f.affixes[affix_id].tier)) + (g.N.affixId - g.N.affixId % 256) / 256;
                    output["equipment"][idx]["data"][affix_start + affix_id * 3 + 1] = g.N.affixId % 256;
                    output["equipment"][idx]["data"][affix_start + affix_id * 3 + 2] = 255;
                    affix_id++;
                }
                if (g.Z) {
                    output["equipment"][idx]["data"][affix_start + affix_id * 3] = get_value_from_tier(parseInt(f.affixes[affix_id].tier)) + (g.Z.affixId - g.Z.affixId % 256) / 256;
                    output["equipment"][idx]["data"][affix_start + affix_id * 3 + 1] = g.Z.affixId % 256;
                    output["equipment"][idx]["data"][affix_start + affix_id * 3 + 2] = 255;
                    affix_id++;
                }
                output["equipment"][idx]["inventoryPosition"] = {"x":0,"y":0};
                output["equipment"][idx]["quantity"] = 1;
                output["equipment"][idx]["containerID"] = get_container_id(e);
                output["equipment"][idx]["formatVersion"] = 2;
                if (!isUnique)
                    output["equipment"][idx]["data"][affix_start + affix_id * 3] = 0;
                idx++;
            }
        });

        console.log(JSON.stringify(output));
        return (JSON.stringify(output));
    }
})();
