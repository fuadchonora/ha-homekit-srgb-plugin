import QtQuick 2.15
import QtQuick.Controls 2.15

ApplicationWindow {
    visible: true
    width: 400
    height: 300
    title: "HA Homekit Lights"

    Rectangle {
        width: parent.width
        height: parent.height
        color: "#ffffff"
        padding: 20

        Column {
            anchors.fill: parent
            spacing: 10

            Text {
                text: "HA Homekit Lights Plugin"
                font.bold: true
                font.pixelSize: 20
                anchors.horizontalCenter: parent.horizontalCenter
            }

            TextField {
                id: haTokenField
                width: parent.width - 40
                placeholderText: "Home Assistant Token"
                text: pluginOptions.haToken
            }

            TextField {
                id: haHostField
                width: parent.width - 40
                placeholderText: "Home Assistant Host"
                text: pluginOptions.haHost
            }

            TextField {
                id: entityIdField
                width: parent.width - 40
                placeholderText: "Entity ID"
                text: pluginOptions.entityId
            }

            Button {
                text: "Save"
                anchors.horizontalCenter: parent.horizontalCenter
                onClicked: {
                    // Call the plugin's method to save the settings
                    pluginOptions.haToken = haTokenField.text
                    pluginOptions.haHost = haHostField.text
                    pluginOptions.entityId = entityIdField.text
                    plugin.saveOptions()
                }
            }
        }
    }
}
