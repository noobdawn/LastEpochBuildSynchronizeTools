import os
import sys

# 为防止报错，手动指定一下PyQt5的系统变量
os.environ["QT_QPA_PLATFORM_PLUGIN_PATH"] = os.path.abspath("Python36/Lib/site-packages/PyQt5/Qt5/plugins")

import json
from PyQt5.QtWidgets import QApplication, QWidget, QVBoxLayout, QHBoxLayout, QPushButton, QComboBox, QTextEdit, QLabel, QMessageBox, QCheckBox, QFileDialog
from utils import *


class ModifyCorruptionSubWindow(QWidget):
    def __init__(self, parent, callback):
        super().__init__()
        self.initUI()
        self.parent = parent
        self.callback = callback

    def initUI(self):
        self.setWindowTitle("修改腐化")
        self.comboBox = QComboBox()
        self.comboBox.placeholderText = "请选择时间线"
        for i in range(timeline_names.__len__()):
            self.comboBox.addItem(timeline_names[i])
        self.label = QLabel("输入腐化值：")
        self.textEdit = QTextEdit()
        self.textEdit.setPlaceholderText("输入腐化值")
        self.textEdit.setFixedHeight(30)
        self.textButton = QPushButton("修改腐化")
        self.textButton.clicked.connect(self.modifyCorruption)
        layout = QVBoxLayout()
        layout.addWidget(self.comboBox)
        layout.addWidget(self.label)
        layout.addWidget(self.textEdit)
        layout.addWidget(self.textButton)
        self.setLayout(layout)

    def modifyCorruption(self):
        corruption = self.textEdit.toPlainText()
        # 如果是整数
        if corruption.isdigit():
            selectedIdx = self.comboBox.currentIndex()
            self.callback(int(corruption), selectedIdx)
            QMessageBox.information(self, "提示", "修改成功")
        else:
            QMessageBox.information(self, "提示", "请输入正确的腐化值！")


class MyWindow(QWidget):
    def __init__(self):
        super().__init__()
        self.initUI()

        load_info()
        save_path = get_info("savePath")
        while (save_path is None or not os.path.exists(save_path)):
            QMessageBox.information(self, "提示", "未能找到存档，请手动设置存档路径")
            save_path = QFileDialog.getExistingDirectory(self, "选择存档路径")
            save_info(save_path)
        self.save_path = save_path

    def initUI(self):
        self.setWindowTitle("最后纪元离线存档同步配装器BD工具 v1.3")
        # 创建用于说明的文本
        self.label = QLabel("使用说明：\n1. 保证《最后纪元》停留在主界面，不要进入游戏，也不要停留在人物选择界面。\n2. 使用配套的油猴插件打开采蘑菇的配装器，点击“复制BD数据到剪贴板”\n3. 选择存档，并粘贴BD数据到下面的输入框中\n4. 点击“修改存档”按钮\n5. 此时方可进入人物选择界面开始游戏\n\n注意：修改存档有风险，背包物品会被覆盖，使用前请存好道具、备份存档。\n跨职业修改存档时，下方技能槽可能需要手动回复。")

        # 创建按钮
        self.openSaveButton = QPushButton("打开存档位置（手动备份用）")
        self.openSaveButton.clicked.connect(self.openSaveFile)

        # 创建下拉框
        self.comboBox = QComboBox()
        self.comboBox.placeholderText = "请选择存档"

        # 创建按钮
        self.button = QPushButton("读取存档")
        self.button.clicked.connect(self.refreshSaveFiles)

        # 创建多行输入框
        self.textEdit = QTextEdit()
        self.textEdit.setPlaceholderText("粘贴BD到这里")

        # 创建勾选框
        self.syncBdCheckBox = QCheckBox("同步BD")
        self.skipPlotCheckBox = QCheckBox("跳过剧情、解锁传送点、解锁地下城和竞技场难度、发现所有祝福")
        self.syncBdCheckBox.setChecked(True)
        self.addStablityCheckBox = QCheckBox("为时间线添加稳定性（鼠标停留查看说明）")
        self.overwriteStablityCheckBox = QCheckBox("重置时间线（鼠标停留查看说明）")
        self.addStablityCheckBox.setToolTip("添加稳定性：为现在所有打过的时间线增加5000稳定性；\n重置时间线：将所有时间线清空并设定为0腐化5000稳定性；\n在修改时间线时，如果你是新号，需要勾选【重置时间线】，如果你已经打过时间线，则千万不要勾选！！！")
        self.overwriteStablityCheckBox.setToolTip("添加稳定性：为现在所有打过的时间线增加5000稳定性；\n重置时间线：将所有时间线清空并设定为0腐化5000稳定性；\n在修改时间线时，如果你是新号，需要勾选【重置时间线】，如果你已经打过时间线，则千万不要勾选！！！")
        

        # 创建按钮
        self.textButton = QPushButton("修改存档")
        self.textButton.clicked.connect(self.modifySaveFile)
        self.corruptionButton = QPushButton("设定腐化")
        self.corruptionButton.clicked.connect(self.openCorruptionSubWindow)

        # 创建超链接
        self.githubLink = QLabel("<a href=https://github.com/noobdawn/LastEpochBuildSynchronizeTools"">Github</a>")
        self.qqgroup = QLabel("问题反馈：QQ群650473806")

        # 设置布局
        layout = QVBoxLayout()
        layout.addWidget(self.label)
        layout.addWidget(self.comboBox)
        layout.addWidget(self.openSaveButton)
        layout.addWidget(self.button)
        layout.addWidget(self.textEdit)
        layout.addWidget(self.syncBdCheckBox)
        layout.addWidget(self.skipPlotCheckBox)
        layout.addWidget(self.addStablityCheckBox)
        layout.addWidget(self.overwriteStablityCheckBox)

        buttonHLayout = QHBoxLayout()
        buttonHLayout.addWidget(self.textButton)
        buttonHLayout.addWidget(self.corruptionButton)
        
        layout.addLayout(buttonHLayout)
        layout.addWidget(self.githubLink)
        layout.addWidget(self.qqgroup)
        self.setLayout(layout)

    def refreshSaveFiles(self):
        self.comboBox.clear()
        files = os.listdir(self.save_path)
        for file in files:
            if file.find("CHARACTERSLOT") != -1 and not file.endswith(".bak") and not file.endswith("_temp"):
                with open(os.path.join(self.save_path, file), "r") as f:
                    savedata = json.loads(f.read()[5:])
                    charname = savedata["characterName"]
                    slot = savedata["slot"]
                    self.comboBox.addItem(f"{charname} - {slot}")

    def openSaveFile(self):
        os.startfile(self.save_path)
        

    def modifySaveFile(self):
        # 获取下拉框选中的存档
        selected = self.comboBox.currentText()
        if selected == "":
            QMessageBox.information(self, "提示", "请选择存档")
            return
        slot = selected.split(" - ")[1]
        savefile = os.path.join(self.save_path, f"1CHARACTERSLOT_BETA_{slot}")
        # 获取bd
        bdStr = self.textEdit.toPlainText()
        isSyncBdOnly = self.syncBdCheckBox.isChecked()
        isSkipPlot = self.skipPlotCheckBox.isChecked()
        isAddStablity = self.addStablityCheckBox.isChecked()
        isOverwriteStablity = self.overwriteStablityCheckBox.isChecked()
        if len(bdStr) < 20 and isSyncBdOnly:
            QMessageBox.information(self, "提示", "请填写正确的bd")
            return
        work(bdStr, savefile, isSyncBdOnly, isSkipPlot, isAddStablity, isOverwriteStablity)
        QMessageBox.information(self, "提示", "修改成功")
        self.textEdit.clear()

    def openCorruptionSubWindow(self):
        # 获取下拉框选中的存档
        selected = self.comboBox.currentText()
        if selected == "":
            QMessageBox.information(self, "提示", "请选择存档")
            return
        self.corruptionSubWindow = ModifyCorruptionSubWindow(self, self.modifyCorruption)
        self.corruptionSubWindow.show()
        self.corruptionSubWindow.move(self.frameGeometry().topLeft() + self.rect().center() - self.corruptionSubWindow.rect().center())
        

    def modifyCorruption(self, corruption, selectedIdx):
        # 获取下拉框选中的存档
        selected = self.comboBox.currentText()
        if selected == "":
            QMessageBox.information(self, "提示", "请选择存档")
            return
        slot = selected.split(" - ")[1]
        savefile = os.path.join(self.save_path, f"1CHARACTERSLOT_BETA_{slot}")
        work_corruption(savefile, corruption, selectedIdx)


if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = MyWindow()
    window.show()
    sys.exit(app.exec_())