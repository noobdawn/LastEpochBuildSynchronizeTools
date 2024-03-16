// ==UserScript==
// @name         最后纪元配装器数据导出-caimogu
// @namespace    http://tampermonkey.net/
// @version      2024-03-03
// @description  try to take over the world!
// @author       You
// @match        https://lastepoch.caimogu.cc/planner.html?id=*
// @match        https://lastepoch.caimogu.cc/planner?id=*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=caimogu.cc
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

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
                $.isPlainObject(f) ? (g.item = f.id && le_Zj(f.id),
                g.Wa = f.ir) : (g.item = f && le_Zj(f),
                g.Wa = []);
                output["blessing"][e] = g.item.subTypeId;
                le_hj("blessing", g, e)
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
            k.item = f.id && le_Zj(f.id);
            var l = le_0j(f.affixes);
            const n = l.vg;
            l = l.suffixes;
            n[0] && (k.O = n[0].data,
            k.pa = n[0].mb,
            k.tb = n[0].Sb);
            l[0] && (k.P = l[0].data,
            k.qa = l[0].mb,
            k.ub = l[0].Sb);
            k.Wa = f.ir;
            k.Za = f.ur;
            le_hj(k, e, g, !0)
    
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
                if (k.O)
                    affix_count++;
                if (k.P)
                    affix_count++;
                output["idols"][idx]["data"][9] = affix_count;
                if (k.O) {
                    output["idols"][idx]["data"][10] = 96 + (k.O.affixId - k.O.affixId % 256) / 256;
                    output["idols"][idx]["data"][11] = k.O.affixId % 256;
                    output["idols"][idx]["data"][12] = 255;
                }
                if (k.P) {
                    output["idols"][idx]["data"][13] = 96 + (k.P.affixId - k.P.affixId % 256) / 256;
                    output["idols"][idx]["data"][14] = k.P.affixId % 256;
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
        $.each(le_pi, function(e) {
            c[e] || (c[e] = {})
        });
        delete c.idol;
        delete c.blessing;
        $db.is2hItem(c.weapon1 && c.weapon1.id && le_Yj(c.weapon1.id)) && delete c.weapon2;
        $.each(c, function(e, f) {
            let g = {};
            g.item = f.id && le_Zj(f.id);
            var k = le_0j(f.affixes)
              , l = k.vg;
            const n = k.suffixes;
            k = null;
            l[0] && (g.O = l[0].data,
            g.pa = l[0].mb,
            g.tb = l[0].Sb,
            g.O && 2 == g.O.specialAffixType && (k = g.O.id));
            l[1] && (g.X = l[1].data,
            g.Da = l[1].mb,
            g.Qc = l[1].Sb,
            g.X && 2 == g.X.specialAffixType && (k = g.X.id));
            n[0] && (g.P = n[0].data,
            g.qa = n[0].mb,
            g.ub = n[0].Sb,
            g.P && 2 == g.P.specialAffixType && (k = g.P.id));
            n[1] && (g.aa = n[1].data,
            g.Ea = n[1].mb,
            g.Xc = n[1].Sb,
            g.aa && 2 == g.aa.specialAffixType && (k = g.aa.id));
            f.sealedAffix && (l = le_1j(f.sealedAffix),
            g.Y = l.data,
            g.Ga = l.mb,
            g.Sc = l.Sb,
            g.Y && 2 == g.Y.specialAffixType && (k = g.Y.id));
            g.Wa = f.ir;
            g.Za = f.ur;
            g.Cc = f.faction;
            g.item && null != k && (f = $db.Rf(g.item.baseTypeId, g.item.subTypeId, k)) && (le_fj(f, g),
            g = f);
            le_jj(e, g)
    
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
                    output["equipment"][idx]["data"][10] = 255;
                    output["equipment"][idx]["data"][11] = 255;
                    output["equipment"][idx]["data"][12] = 255;
                    output["equipment"][idx]["data"][13] = 255;
                    output["equipment"][idx]["data"][14] = 255;
                    output["equipment"][idx]["data"][15] = 255;
                    output["equipment"][idx]["data"][16] = 255;
                    output["equipment"][idx]["data"][17] = 255;
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
                        output["equipment"][idx]["data"][10] = get_value_from_tier(f.sealedAffix.tier) + (g.Y.affixId - g.Y.affixId % 256) / 256;
                        output["equipment"][idx]["data"][11] = g.Y.affixId % 256;
                        output["equipment"][idx]["data"][12] = 255;
                        affix_start = 13;
                    }
                    else
                        affix_start = 10;
                }
                if (g.O){
                    output["equipment"][idx]["data"][affix_start + affix_id * 3] = get_value_from_tier(parseInt(f.affixes[affix_id].tier)) + (g.O.affixId - g.O.affixId % 256) / 256;
                    output["equipment"][idx]["data"][affix_start + affix_id * 3 + 1] = g.O.affixId % 256;
                    output["equipment"][idx]["data"][affix_start + affix_id * 3 + 2] = 255;
                    affix_id++;
                }
                if (g.X) {
                    output["equipment"][idx]["data"][affix_start + affix_id * 3] = get_value_from_tier(parseInt(f.affixes[affix_id].tier)) + (g.X.affixId - g.X.affixId % 256) / 256;
                    output["equipment"][idx]["data"][affix_start + affix_id * 3 + 1] = g.X.affixId % 256;
                    output["equipment"][idx]["data"][affix_start + affix_id * 3 + 2] = 255;
                    affix_id++;
                }
                if (g.P) {
                    output["equipment"][idx]["data"][affix_start + affix_id * 3] = get_value_from_tier(parseInt(f.affixes[affix_id].tier)) + (g.P.affixId - g.P.affixId % 256) / 256;
                    output["equipment"][idx]["data"][affix_start + affix_id * 3 + 1] = g.P.affixId % 256;
                    output["equipment"][idx]["data"][affix_start + affix_id * 3 + 2] = 255;
                    affix_id++;
                }
                if (g.aa) {
                    output["equipment"][idx]["data"][affix_start + affix_id * 3] = get_value_from_tier(parseInt(f.affixes[affix_id].tier)) + (g.aa.affixId - g.aa.affixId % 256) / 256;
                    output["equipment"][idx]["data"][affix_start + affix_id * 3 + 1] = g.aa.affixId % 256;
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