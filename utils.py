import json
import os

timeline_names = {
    0 : "所有时间线",
    1 : "流亡者的陨落（58）",
    2 : "被盗的长矛（62）",
    3 : "黑暗的太阳（66）",
    4 : "鲜血、霜冻、死亡（70）",
    5 : "终结风暴（75）",
    6 : "帝国陨落（80）",
    7 : "巨龙君临（85）",
    8 : "最后废墟（90）",
    9 : "寒冬纪元（90）",
    10 : "烈焰魂灵（90）",
}

settings = {}


def get_info(key):
    global settings
    return settings.get(key, None)


def load_info():
    global settings
    if not os.path.exists("settings.inf"):
        user = os.getlogin()
        path = f"C:/Users/{user}/AppData/LocalLow/Eleventh Hour Games/Last Epoch/Saves"
        # 创建一个默认的配置文件
        settings = {
            "savePath": path,
        }
        with open("settings.inf", "w", encoding="utf-8") as f:
            f.write(json.dumps(settings, indent=4))
    else:
        with open("settings.inf", "r", encoding="utf-8") as f:
            settings = json.loads(f.read())
            print(f.read())

def save_info(save_path):
    global settings
    settings["savePath"] = save_path
    with open("settings.inf", "w", encoding="utf-8") as f:
        f.write(json.dumps(settings, indent=4))


def work(bdStr, saveFilePath, isSyncBdOnly, isSkipPlot):
    data = None
    with open(saveFilePath, 'r', encoding='utf-8') as f:
        data = json.loads(f.read()[5:])

    if data is None:
        exit(1)


    data["level"] = 100                                                 # 调整等级

    if isSkipPlot:
        data["arenaTiersCompleted"] = [0, 1, 2, 3]                          # 调整竞技场层数
        data["blessingsDiscovered"] = [ x for x in range(224) ]             # 调整已发现祝福
        data["dungeonCompletion"] = [ 
            {
                "dungeonID" : i,
                "tiersCompleted" : [0, 1, 2, 3]
            }
            for i in range(3) ]      # 调整地下城完成情况
        # 跳过新手教程
        data["closedIdolsTooltip"] = True
        data["closedMinSkillLevelTutorial"] = True
        data["closedMonolithTooltip"] = True
        data["closedPassivesTooltip"] = True
        data["closedSkillsTooltip"] = True
        # 跳过剧情
        data["savedQuests"] = [{"questID":127,"questStepID":678,"state":0,"questBranch":0,"completeObjectives":[623,624,580,581,582,583,584,585],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":128,"questStepID":687,"state":0,"questBranch":0,"completeObjectives":[586,587,588,589,590,591,592,593],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":131,"questStepID":714,"state":0,"questBranch":0,"completeObjectives":[613,614,617,618,619],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":129,"questStepID":696,"state":0,"questBranch":0,"completeObjectives":[594,595,596,598,597,600,601],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":130,"questStepID":708,"state":0,"questBranch":0,"completeObjectives":[602,603,604,605,606,607,608,610,611,612],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":48,"questStepID":281,"state":0,"questBranch":0,"completeObjectives":[626,247,248,249,250,251,252,253],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":1,"questStepID":4,"state":0,"questBranch":0,"completeObjectives":[1,2,3,48],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":49,"questStepID":284,"state":0,"questBranch":0,"completeObjectives":[254,255,256,257],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":3,"questStepID":12,"state":0,"questBranch":0,"completeObjectives":[8,9],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":11,"questStepID":44,"state":0,"questBranch":0,"completeObjectives":[33],"failedObjectives":[34],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":3},{"questID":94,"questStepID":493,"state":0,"questBranch":0,"completeObjectives":[404,405,406,407,408],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":5,"questStepID":14,"state":0,"questBranch":0,"completeObjectives":[22,24,25,26,62,625,10],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":34,"questStepID":197,"state":0,"questBranch":0,"completeObjectives":[175,177,178,179],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":97,"questStepID":510,"state":0,"questBranch":0,"completeObjectives":[420,421,422],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":35,"questStepID":202,"state":0,"questBranch":0,"completeObjectives":[180,181,182,190,191,183],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":2,"questStepID":24,"state":0,"questBranch":0,"completeObjectives":[4,5,6,7,20],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":1},{"questID":39,"questStepID":230,"state":0,"questBranch":0,"completeObjectives":[202,206,207],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":14,"questStepID":101,"state":0,"questBranch":0,"completeObjectives":[139,149,47,50,88,89,90,91,96,97,98],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":6,"questStepID":47,"state":0,"questBranch":0,"completeObjectives":[11,15,431,16,17,61],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":9,"questStepID":38,"state":0,"questBranch":0,"completeObjectives":[29,30,31],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":96,"questStepID":506,"state":0,"questBranch":0,"completeObjectives":[413,414,415,416,417,418,419],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":99,"questStepID":520,"state":0,"questBranch":0,"completeObjectives":[427,428,429],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":29,"questStepID":160,"state":0,"questBranch":0,"completeObjectives":[144,145,146,147],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":100,"questStepID":525,"state":0,"questBranch":0,"completeObjectives":[435,434],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":10,"questStepID":40,"state":0,"questBranch":0,"completeObjectives":[28],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":13,"questStepID":60,"state":0,"questBranch":0,"completeObjectives":[41,436,437,438,43,44,45,49,46],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":28,"questStepID":155,"state":0,"questBranch":0,"completeObjectives":[142,143],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":12,"questStepID":54,"state":0,"questBranch":0,"completeObjectives":[35,36,37,38,39,40],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":116,"questStepID":596,"state":0,"questBranch":0,"completeObjectives":[514],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":20,"questStepID":106,"state":0,"questBranch":0,"completeObjectives":[92,93,94,95,105,106],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":24,"questStepID":128,"state":0,"questBranch":0,"completeObjectives":[108,109,110,111,112,113,114,115,116],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":30,"questStepID":168,"state":0,"questBranch":0,"completeObjectives":[150,151,152,153,154],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":25,"questStepID":136,"state":0,"questBranch":0,"completeObjectives":[117,118,119,121,120,122,123],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":36,"questStepID":209,"state":0,"questBranch":0,"completeObjectives":[184,185,186,187,188,192,189],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":31,"questStepID":176,"state":0,"questBranch":0,"completeObjectives":[155,156,162,157,158,159,163,160,164,161],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":33,"questStepID":187,"state":0,"questBranch":0,"completeObjectives":[169,627,170,174,171],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":32,"questStepID":189,"state":0,"questBranch":0,"completeObjectives":[628,165,166,167,173,168,172],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":42,"questStepID":240,"state":0,"questBranch":0,"completeObjectives":[245,212,213,214,215,239,216],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":44,"questStepID":254,"state":0,"questBranch":0,"completeObjectives":[223,244,224,225,226,246,227,228],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":47,"questStepID":270,"state":0,"questBranch":0,"completeObjectives":[240,241,242,243],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":43,"questStepID":246,"state":0,"questBranch":0,"completeObjectives":[217,222,218,219,220,221],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":46,"questStepID":266,"state":0,"questBranch":0,"completeObjectives":[235,237,236,238],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":45,"questStepID":261,"state":0,"questBranch":0,"completeObjectives":[229,230,231,232,233,234],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":50,"questStepID":288,"state":0,"questBranch":0,"completeObjectives":[258,309,260],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":51,"questStepID":295,"state":0,"questBranch":0,"completeObjectives":[261,262,263,264,265,266,267],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":53,"questStepID":306,"state":0,"questBranch":0,"completeObjectives":[271,272,274,275,313,276,571],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":93,"questStepID":487,"state":0,"questBranch":0,"completeObjectives":[400,401,402,403],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":58,"questStepID":339,"state":0,"questBranch":0,"completeObjectives":[302,303,304,305,306,307],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":56,"questStepID":322,"state":0,"questBranch":0,"completeObjectives":[287,288,289,291,292],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":54,"questStepID":312,"state":0,"questBranch":0,"completeObjectives":[277,293,294,278,279,280,308,281,282],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":55,"questStepID":316,"state":0,"questBranch":0,"completeObjectives":[283,285,286],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":57,"questStepID":332,"state":0,"questBranch":0,"completeObjectives":[295,310,311,296,297,298,312,299,300,301,572],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":125,"questStepID":668,"state":0,"questBranch":0,"completeObjectives":[576,577],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":114,"questStepID":584,"state":0,"questBranch":0,"completeObjectives":[495,496,497,498,499,500,501,502,503,554,504],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":121,"questStepID":626,"state":0,"questBranch":0,"completeObjectives":[536,537,538,539],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":118,"questStepID":609,"state":0,"questBranch":0,"completeObjectives":[519,520,521,522,524,525],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":119,"questStepID":615,"state":0,"questBranch":0,"completeObjectives":[556,558,557,526,527,528,529],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":115,"questStepID":593,"state":0,"questBranch":0,"completeObjectives":[505,506,507,567,508,513,509,510,511,512],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":120,"questStepID":621,"state":0,"questBranch":0,"completeObjectives":[531,532,533,534,535],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":1},{"questID":117,"questStepID":601,"state":0,"questBranch":0,"completeObjectives":[573,515,516,517,518],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":123,"questStepID":640,"state":0,"questBranch":0,"completeObjectives":[545,546,547,552,548,549,550,553,551,568,569,570],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":133,"questStepID":728,"state":0,"questBranch":0,"completeObjectives":[629,630],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":134,"questStepID":730,"state":0,"questBranch":0,"completeObjectives":[631],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":1},{"questID":122,"questStepID":632,"state":0,"questBranch":0,"completeObjectives":[540,541,542,543,544],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":124,"questStepID":656,"state":0,"questBranch":0,"completeObjectives":[559,560,574,575,561,562,563,564,565,566],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0},{"questID":27,"questStepID":144,"state":0,"questBranch":0,"completeObjectives":[126,128,129],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":3},{"questID":83,"questStepID":453,"state":0,"questBranch":0,"completeObjectives":[480],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":1},{"questID":37,"questStepID":217,"state":0,"questBranch":0,"completeObjectives":[193,195,196],"failedObjectives":[],"nolongerRelevantObjectives":[],"objectiveProgress":[],"trackStatus":0}]
        data["sceneProgresses"] = [{"scene":"Z22","savedProgress":1125895508115455,"version":1},{"scene":"Z42","savedProgress":8444266615390211,"version":1},{"scene":"Z1S10","savedProgress":8589639614,"version":1},{"scene":"Z52","savedProgress":432089365092490750,"version":1},{"scene":"Z62","savedProgress":35184354875406330,"version":1},{"scene":"Z72","savedProgress":134201343,"version":1},{"scene":"Z82","savedProgress":35527436367561200,"version":1},{"scene":"Z92","savedProgress":34903442585960450,"version":1},{"scene":"Z102","savedProgress":32767231,"version":1},{"scene":"Z32","savedProgress":6584184864767,"version":1},{"scene":"A06","savedProgress":10027545957039872,"version":1},{"scene":"A10","savedProgress":6478462973465068000,"version":1},{"scene":"A3S10","savedProgress":243,"version":1},{"scene":"A40","savedProgress":28296188629844990,"version":1},{"scene":"A45","savedProgress":51072,"version":1},{"scene":"A30","savedProgress":4029678591,"version":1},{"scene":"A60TR","savedProgress":70931694667956220,"version":2},{"scene":"A60","savedProgress":575537161462382340,"version":1},{"scene":"A50","savedProgress":232154199971979260,"version":1},{"scene":"A70","savedProgress":44440028487089980,"version":1},{"scene":"A80","savedProgress":14,"version":1},{"scene":"A90","savedProgress":17591372423167,"version":1},{"scene":"B10","savedProgress":7010779136,"version":1},{"scene":"B20","savedProgress":2061567459331,"version":1},{"scene":"B33","savedProgress":22518307374514056,"version":1},{"scene":"B7S10","savedProgress":279308692619263,"version":1},{"scene":"B25","savedProgress":4503891685211585,"version":1},{"scene":"B36","savedProgress":67553994511220740,"version":2},{"scene":"B1S30","savedProgress":288229960198389630,"version":1},{"scene":"B1S40","savedProgress":31525197926367490,"version":1},{"scene":"B40TR","savedProgress":126065673846667520,"version":2},{"scene":"B40","savedProgress":141845830419087360,"version":2},{"scene":"B50","savedProgress":2269722578052094,"version":1},{"scene":"B90","savedProgress":1906969638921,"version":1},{"scene":"B100","savedProgress":270851407360,"version":1},{"scene":"C10","savedProgress":0,"version":1},{"scene":"C20","savedProgress":68677969098309680,"version":1},{"scene":"C30","savedProgress":1296594751050414000,"version":1},{"scene":"C35","savedProgress":0,"version":1},{"scene":"B30","savedProgress":355784654036139970,"version":1},{"scene":"B4S10","savedProgress":12582911,"version":1},{"scene":"C1S10","savedProgress":11470655048515584,"version":1},{"scene":"C50","savedProgress":17592060016639,"version":1},{"scene":"C60","savedProgress":9010222076527588,"version":1},{"scene":"C65","savedProgress":147407,"version":1},{"scene":"C70","savedProgress":16160885807438627000,"version":1},{"scene":"C80","savedProgress":0,"version":1},{"scene":"D10","savedProgress":16837835431670816,"version":1},{"scene":"D20","savedProgress":11030299576111104,"version":1},{"scene":"D35","savedProgress":0,"version":1},{"scene":"D30","savedProgress":3382028510810096,"version":1},{"scene":"D40","savedProgress":7044333568,"version":1},{"scene":"D05","savedProgress":23089261705215,"version":1},{"scene":"D50","savedProgress":4467852305797152300,"version":1},{"scene":"D60","savedProgress":35165996970623,"version":1},{"scene":"D80","savedProgress":8406931,"version":1},{"scene":"E10","savedProgress":33474138112511,"version":1},{"scene":"E20TR","savedProgress":262080,"version":1},{"scene":"E20","savedProgress":504963600912744450,"version":1},{"scene":"E30","savedProgress":18417327739619360000,"version":1},{"scene":"E40","savedProgress":4610560324676870000,"version":1},{"scene":"E50","savedProgress":8690573998736376,"version":1},{"scene":"E1S10","savedProgress":2238273346769256400,"version":1},{"scene":"E60","savedProgress":645247,"version":1},{"scene":"E70","savedProgress":1116966504628351,"version":1},{"scene":"E80","savedProgress":279168315062276,"version":1},{"scene":"E90","savedProgress":15252304637650916,"version":1},{"scene":"F20","savedProgress":4468559136685057,"version":1},{"scene":"F30","savedProgress":1830419,"version":1},{"scene":"F1S10","savedProgress":1730050896882303000,"version":1},{"scene":"F50","savedProgress":1153206860117950500,"version":1},{"scene":"F60","savedProgress":539152080911,"version":1},{"scene":"F70","savedProgress":63050394781351940,"version":1},{"scene":"F80","savedProgress":1729382247815970800,"version":1},{"scene":"F100","savedProgress":140733189193728,"version":1},{"scene":"F110","savedProgress":131100,"version":1},{"scene":"F120","savedProgress":100125,"version":1},{"scene":"G20","savedProgress":0,"version":1},{"scene":"G10","savedProgress":4398045986815,"version":1},{"scene":"F40","savedProgress":9000593598713855,"version":1},{"scene":"G30","savedProgress":1991153968742397000,"version":1},{"scene":"G50","savedProgress":105834539703599100,"version":1},{"scene":"ArenaLobby","savedProgress":9042366446960640,"version":1},{"scene":"G40","savedProgress":2473766936319,"version":1},{"scene":"G1S10","savedProgress":8967842321924095,"version":1},{"scene":"G80","savedProgress":103903847514111,"version":1},{"scene":"H20","savedProgress":585459224117506000,"version":1},{"scene":"H10","savedProgress":23924441039,"version":1},{"scene":"H30","savedProgress":0,"version":1},{"scene":"H40","savedProgress":25861346700689390,"version":1},{"scene":"H60","savedProgress":36025498366115830,"version":1},{"scene":"H50","savedProgress":8589668351,"version":1},{"scene":"H80","savedProgress":0,"version":1},{"scene":"H90","savedProgress":1617930436509695,"version":1},{"scene":"H100","savedProgress":13042072678201025000,"version":1},{"scene":"H105","savedProgress":0,"version":1},{"scene":"H110","savedProgress":0,"version":1},{"scene":"H120","savedProgress":16079258046693372,"version":1},{"scene":"H130","savedProgress":16777215,"version":1},{"scene":"H140","savedProgress":246290805948416,"version":1},{"scene":"Graveyard","savedProgress":1107547914240,"version":1},{"scene":"C2S10","savedProgress":0,"version":1},{"scene":"B6S10","savedProgress":9015712844611584,"version":1},{"scene":"C40TR","savedProgress":1080868302172978700,"version":1},{"scene":"C40","savedProgress":288238210173239300,"version":1},{"scene":"F5S10","savedProgress":54570892398690300,"version":1}]
        data["unlockedWaypointScenes"] = ["A06","A10","A30","A45","A50","A60","A60TR","A70","A90","ArenaLobby","Arena_1_Forest","B10","B1S40","B20","B25","B30","B33","B40","B40TR","B50","B60","B7S10","B80","Bazaar","C10","C20","C2S10","C30","C35","C40","C40TR","C50","C5S10","C60","C70","D05","D05TR","D20","D30","D40","D60","D80","Dun1Q10","Dun2Q10","Dun3Q10","E10","E20","E20TR","E30","E40","E50","E60","E80","E90","EoT","F10","F100","F110","F1S10","F40","F50","F5S10","F70","F80","F90","G110","G1S10","G2S10","G40","G60","G70","G80","G90","G93","G96","H10","H100","H110","H120","H40","H50","H70","H80","MonolithHub","Observatory","Z102","Z22","Z32","Z52","Z72","Z82","Z92"]
        data["timelineCompletion"] = [{"timelineID":1,"progress":[1,0]},{"timelineID":2,"progress":[1,0]},{"timelineID":3,"progress":[1,0]},{"timelineID":4,"progress":[1,0]},{"timelineID":5,"progress":[1,0]},{"timelineID":6,"progress":[1,0]},{"timelineID":7,"progress":[1,0]},{"timelineID":8,"progress":[1,0]},{"timelineID":9,"progress":[1,0]},{"timelineID":10,"progress":[1,0]}]
        data["timelineDifficultyUnlocks"] = [{"timelineID":1,"progress":[0,1]},{"timelineID":2,"progress":[0,1]},{"timelineID":3,"progress":[0,1]},{"timelineID":4,"progress":[0,1]},{"timelineID":5,"progress":[0,1]},{"timelineID":6,"progress":[0,1]},{"timelineID":7,"progress":[0,1]},{"timelineID":8,"progress":[0,1]},{"timelineID":9,"progress":[0,1]},{"timelineID":10,"progress":[0,1]}]
        
    if isSyncBdOnly:
        bd = json.loads(bdStr)

        # 设置祝福
        data["savedItems"] = [{"itemData":"","data":[1,34,1,0,255,255,255,0,0,0],"inventoryPosition":{"x":0,"y":0},"quantity":1,"containerID":33,"formatVersion":2},{"itemData":"","data":[1,34,24,0,255,255,255,0,0,0],"inventoryPosition":{"x":0,"y":0},"quantity":1,"containerID":34,"formatVersion":2},{"itemData":"","data":[1,34,47,0,255,255,255,0,0,0],"inventoryPosition":{"x":0,"y":0},"quantity":1,"containerID":35,"formatVersion":2},{"itemData":"","data":[1,34,128,0,255,255,255,0,0,0],"inventoryPosition":{"x":0,"y":0},"quantity":1,"containerID":36,"formatVersion":2},{"itemData":"","data":[1,34,73,0,255,255,255,0,0,0],"inventoryPosition":{"x":0,"y":0},"quantity":1,"containerID":37,"formatVersion":2},{"itemData":"","data":[1,34,137,0,255,255,255,0,0,0],"inventoryPosition":{"x":0,"y":0},"quantity":1,"containerID":38,"formatVersion":2},{"itemData":"","data":[1,34,151,0,255,255,255,0,0,0],"inventoryPosition":{"x":0,"y":0},"quantity":1,"containerID":39,"formatVersion":2},{"itemData":"","data":[1,34,173,0,255,255,255,0,0,0],"inventoryPosition":{"x":0,"y":0},"quantity":1,"containerID":43,"formatVersion":2},{"itemData":"","data":[1,34,199,0,255,255,255,0,0,0],"inventoryPosition":{"x":0,"y":0},"quantity":1,"containerID":44,"formatVersion":2},{"itemData":"","data":[1,34,205,0,255,255,255,0,0,0],"inventoryPosition":{"x":0,"y":0},"quantity":1,"containerID":45,"formatVersion":2}]
        for i in range(10):
            if str(i) in bd["blessing"].keys():
                bless_id = bd["blessing"][str(i)]
                data["savedItems"][i]["data"] = [1, 34, bless_id, 0, 255, 255, 255, 0, 0, 0]
        # 设置职业
        data["characterClass"] = bd["class"]
        data["chosenMastery"] = bd["mastery"]
        # 设置天赋树
        totalPoints = 113
        if type(bd["chartree"]) is dict:
            nodeIDs = [int(x) for x in bd["chartree"].keys()]
            nodePoints = list(bd["chartree"].values())
        else:
            nodeIDs = []
            nodePoints = []
            for i, v in enumerate(bd["chartree"]):
                if v is not None:
                    nodeIDs.append(i)
                    nodePoints.append(v)
        unspentPoints = totalPoints - sum(nodePoints)
        data["savedCharacterTree"]["nodeIDs"] = nodeIDs
        data["savedCharacterTree"]["nodePoints"] = nodePoints
        data["savedCharacterTree"]["unspentPoints"] = unspentPoints
        # 设置技能树
        data_skill_trees = []
        for skill in bd["skilltrees"]:
            # 如果不是字典的话，就跳过
            if type(skill["selected"]) is not dict:
                continue
            data_skill = {
                "treeID" : skill["treeID"],
                "slotNumber" : skill["slotNumber"],
                "xp" : 13000000,
                "nodeIDs" : [int(x) for x in skill["selected"].keys()],
                "nodePoints" : list(skill["selected"].values()),
                "unspentPoints" : 0,
                "nodesTaken" : None,
                "abilityXP" : 0.0
            }
            # 官网天梯的版本不带version
            if skill.get("version") is not None:
                data_skill["version"] = skill["version"]
            data_skill_trees.append(data_skill)
        data["savedSkillTrees"] = data_skill_trees
        if bd.get("hud") is not None:
            data["abilityBar"] = bd["hud"]
        # 设置神像
        idol_idx = 0
        for idol in bd["idols"]:
            if idol is not None:
                # 插入到最前面
                data["savedItems"].insert(idol_idx, idol)
                idol_idx += 1

        # 设置装备
        equip_idx = 0
        for equip in bd["equipment"]:
            if equip is not None:
                data["savedItems"].insert(equip_idx, equip)
                idol_idx += 1

    with open(saveFilePath, 'w', encoding='utf-8') as f:
        f.write('EPOCH' + json.dumps(data))


def work_stablity(saveFilePath, stablity, selectedIdx):
    data = None
    with open(saveFilePath, 'r', encoding='utf-8') as f:
        data = json.loads(f.read()[5:])
    if data is None:
        exit(1)

    if stablity >= 0:
        if selectedIdx == 0:
            if data.get("monolithRuns") is None:
                data["monolithRuns"] = []
            for i in range(10):
                if i * 2 + 0 >= len(data["monolithRuns"]):
                    data["monolithRuns"].append({"timelineID": i + 1, "difficultyIndex": 0, "depth": 0, "questCompletion": 0, "questBranch": 0, "bossLootDropped": False, "savedEchoWeb": {"version": 0, "corruption": 0, "echoesSinceLastDeath": 0, "gazeOfOrobyss": 0, "islands": []}})
                else:
                    data["monolithRuns"][i * 2 + 0]["stability"] = stablity
                if i * 2 + 1 >= len(data["monolithRuns"]):
                    data["monolithRuns"].append({"timelineID": i + 1, "difficultyIndex": 1, "depth": 0, "questCompletion": 0, "questBranch": 0, "bossLootDropped": False, "savedEchoWeb": {"version": 0, "corruption": 0, "echoesSinceLastDeath": 0, "gazeOfOrobyss": 0, "islands": []}})
                else:
                    data["monolithRuns"][i * 2 + 1]["stability"] = stablity
        else:
            if data.get("monolithRuns") is not None:
                found = False
                for i in range(len(data["monolithRuns"])):
                    if data["monolithRuns"][i]["timelineID"] == selectedIdx:
                        data["monolithRuns"][i]["stability"] = stablity
                        found = True
                if not found:
                    data["monolithRuns"].append({"timelineID": selectedIdx, "difficultyIndex": 0, "depth": 0, "questCompletion": 0, "questBranch": 0, "bossLootDropped": False, "savedEchoWeb": {"version": 0, "corruption": 0, "echoesSinceLastDeath": 0, "gazeOfOrobyss": 0, "islands": []}})
                    data["monolithRuns"].append({"timelineID": selectedIdx, "difficultyIndex": 1, "depth": 0, "questCompletion": 0, "questBranch": 0, "bossLootDropped": False, "savedEchoWeb": {"version": 0, "corruption": 0, "echoesSinceLastDeath": 0, "gazeOfOrobyss": 0, "islands": []}})

    with open(saveFilePath, 'w', encoding='utf-8') as f:
        f.write('EPOCH' + json.dumps(data))

def work_corruption(saveFilePath, corruption, selectedIdx):
    data = None
    with open(saveFilePath, 'r', encoding='utf-8') as f:
        data = json.loads(f.read()[5:])
    if data is None:
        exit(1)

    if corruption >= 0:
        if selectedIdx == 0:
            if data.get("monolithRuns") is None:
                data["monolithRuns"] = []
            for i in range(10):
                if i * 2 + 0 >= len(data["monolithRuns"]):
                    data["monolithRuns"].append({"timelineID": i + 1, "difficultyIndex": 0, "depth": 0, "questCompletion": 0, "questBranch": 0, "bossLootDropped": False, "savedEchoWeb": {"version": 0, "corruption": corruption, "echoesSinceLastDeath": 0, "gazeOfOrobyss": 0, "islands": []}})
                else:
                    data["monolithRuns"][i * 2 + 0]["savedEchoWeb"]["corruption"] = corruption
                if i * 2 + 1 >= len(data["monolithRuns"]):
                    data["monolithRuns"].append({"timelineID": i + 1, "difficultyIndex": 1, "depth": 0, "questCompletion": 0, "questBranch": 0, "bossLootDropped": False, "savedEchoWeb": {"version": 0, "corruption": corruption, "echoesSinceLastDeath": 0, "gazeOfOrobyss": 0, "islands": []}})
                else:
                    data["monolithRuns"][i * 2 + 1]["savedEchoWeb"]["corruption"] = corruption

        else:
            if data.get("monolithRuns") is not None:
                found = False
                for i in range(len(data["monolithRuns"])):
                    if data["monolithRuns"][i]["timelineID"] == selectedIdx:
                        if data["monolithRuns"][i].get("savedEchoWeb") is None:
                            data["monolithRuns"][i]["savedEchoWeb"] = {
                                "version": 0,
                                "corruption": corruption,
                                "echoesSinceLastDeath": 0,
                                "gazeOfOrobyss": 0,
                                "islands": []
                            }
                        else:
                            data["monolithRuns"][i]["savedEchoWeb"]["corruption"] = corruption
                        found = True
                if not found:
                    data["monolithRuns"].append({"timelineID": selectedIdx, "difficultyIndex": 0, "depth": 0, "questCompletion": 0, "questBranch": 0, "bossLootDropped": False, "savedEchoWeb": {"version": 0, "corruption": corruption, "echoesSinceLastDeath": 0, "gazeOfOrobyss": 0, "islands": []}})
                    data["monolithRuns"].append({"timelineID": selectedIdx, "difficultyIndex": 1, "depth": 0, "questCompletion": 0, "questBranch": 0, "bossLootDropped": False, "savedEchoWeb": {"version": 0, "corruption": corruption, "echoesSinceLastDeath": 0, "gazeOfOrobyss": 0, "islands": []}})
                    

    with open(saveFilePath, 'w', encoding='utf-8') as f:
        f.write('EPOCH' + json.dumps(data))