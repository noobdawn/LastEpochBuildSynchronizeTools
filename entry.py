import os
import sys
import json
from PyQt5.QtWidgets import QApplication, QWidget, QVBoxLayout, QPushButton, QComboBox, QTextEdit, QLabel, QMessageBox
from utils import work

class MyWindow(QWidget):
    def __init__(self):
        super().__init__()
        self.initUI()

    def initUI(self):
        self.setWindowTitle("最后纪元离线存档同步配装器BD工具")
        # 创建用于说明的文本
        self.label = QLabel("使用说明：\n1. 保证《最后纪元》停留在主界面，不要进入游戏，也不要停留在人物选择界面。\n2. 使用配套的油猴插件打开采蘑菇的配装器，点击“复制BD数据到剪贴板”\n3. 选择存档，并粘贴BD数据到下面的输入框中\n4. 点击“修改存档”按钮\n5. 此时方可进入人物选择界面开始游戏\n\n注意：修改存档有风险，使用前请备份存档。\n跨职业修改存档时，下方技能槽需要手动回复。")

        # 创建下拉框
        self.comboBox = QComboBox()
        self.comboBox.placeholderText = "请选择存档"

        # 创建按钮
        self.button = QPushButton("读取存档")
        self.button.clicked.connect(self.refreshSaveFiles)

        # 创建多行输入框
        self.textEdit = QTextEdit()
        self.textEdit.setPlaceholderText("粘贴BD到这里")

        # 创建按钮
        self.textButton = QPushButton("修改存档")
        self.textButton.clicked.connect(self.modifySaveFile)

        # 设置布局
        layout = QVBoxLayout()
        layout.addWidget(self.label)
        layout.addWidget(self.comboBox)
        layout.addWidget(self.button)
        layout.addWidget(self.textEdit)
        layout.addWidget(self.textButton)
        self.setLayout(layout)

    def refreshSaveFiles(self):
        # 清空下拉框
        self.comboBox.clear()
        # 遍历C:/Users/{用户名}/AppData/LocalLow/Eleventh Hour Games/Last Epoch/Saves/
        user = os.getlogin()
        path = f"C:/Users/{user}/AppData/LocalLow/Eleventh Hour Games/Last Epoch/Saves/"
        files = os.listdir(path)
        for file in files:
            if file.find("CHARACTERSLOT") != -1 and not file.endswith(".bak"):
                with open(path + file, "r") as f:
                    savedata = json.loads(f.read()[5:])
                    charname = savedata["characterName"]
                    slot = savedata["slot"]
                    self.comboBox.addItem(f"{charname} - {slot}")
        

    def modifySaveFile(self):
        # 获取下拉框选中的存档
        selected = self.comboBox.currentText()
        if selected == "":
            QMessageBox.information(self, "提示", "请选择存档")
            return
        slot = selected.split(" - ")[1]
        savefile = f"C:/Users/{os.getlogin()}/AppData/LocalLow/Eleventh Hour Games/Last Epoch/Saves/1CHARACTERSLOT_BETA_{slot}"
        # 获取bd
        bdStr = self.textEdit.toPlainText()
        if len(bdStr) < 20:
            QMessageBox.information(self, "提示", "请填写正确的bd")
            return
        work(bdStr, savefile)
        QMessageBox.information(self, "提示", "修改成功")


if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = MyWindow()
    window.show()
    sys.exit(app.exec_())