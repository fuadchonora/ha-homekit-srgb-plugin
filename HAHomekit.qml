Item {
	anchors.fill: parent
	Column{
        width: parent.width
        height: parent.height
		spacing: 10

		Rectangle{
			id: scanningItem
			height: 50
			width: childrenRect.width + 15
			visible: service.controllers.length === 0
			color: theme.background3
			radius: theme.radius

			BusyIndicator {
				id: scanningIndicator
				height: 30
				anchors.verticalCenter: parent.verticalCenter
				width: parent.height
				Material.accent: "#88FFFFFF"
				running: scanningItem.visible
			}  

			Column{
				width: childrenRect.width
				anchors.left: scanningIndicator.right
				anchors.verticalCenter: parent.verticalCenter

				Text{
					color: theme.secondarytextcolor
					text: "Searching network for Nanoleaf Controllers" 
					font.pixelSize: 14
					font.family: "Montserrat"
				}
				Text{
					color: theme.secondarytextcolor
					text: "This may take several minutes..." 
					font.pixelSize: 14
					font.family: "Montserrat"
				}
			}
		}

		// Rectangle{
		// 	width: 220
		// 	height: discoveryCol.childrenRect.height + discoveryCol.padding * 2
		// 	color: theme.background2
		// 	radius: theme.radius

		// 	Column{
		// 		id: discoveryCol
		// 		width: parent.width
		// 		spacing: 5
		// 		padding: 10

		// 		Label{
		// 			font.family: theme.secondaryfont
		// 			color: theme.primarytextcolor
		// 			font.weight: Font.Bold
		// 			font.pixelSize: 16
		// 			text: qsTr("Discover Nanoleaf by IP")
		// 		}

		// 		STextField{
		// 			id: ipDiscoveryText

		// 			textfield{
		// 				    validator: RegularExpressionValidator {
		// 							regularExpression: /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/
		// 						}

		// 				placeholderText: qsTr("ipv4 ip address")
		// 			}
		// 		}

		// 		SButton{
		// 			width: 150
		// 			height: 30
		// 			anchors.horizontalCenter: parent.horizontalCenter
		// 			label {
        //                 text: qsTr("Discover") 
        //                 font.family: "Poppins"
        //                 color: theme.secondarytextcolor
        //                 font.pixelSize: 16
        //                 font.weight: Font.Bold
        //             }

		// 			onClicked:{
		// 				service.log(ipDiscoveryText.text)
						
		// 				if(discovery.currentlyValidatingIP){
		// 					return;
		// 				}

		// 				if(ipDiscoveryText.text.split(".").length != 4){
		// 					ip4partErrorText.visible = true
		// 				}else{
		// 					ip4partErrorText.visible = false
		// 					//discovery.ValidateIPAddress(ipDiscoveryText.text);
		// 					discovery.CreateController({ip: ipDiscoveryText.text, port: 16021, id: ipDiscoveryText.text});
		// 				}
		// 			}
		// 		}

		// 		Text{
		// 			id: ipvalidationFailureErrorText
		// 			visible: discovery.failedToValidateIP
		// 			color: theme.warn
		// 			text: qsTr("No response from ip address. Are you sure it's powered on and a nanoleaf product?")
        //             wrapMode: Text.WrapAtWordBoundaryOrAnywhere
		// 			width: parent.width - discoveryCol.padding * 2
		// 		}

		// 		Text{
		// 			id: ip4partErrorText
		// 			visible: false
		// 			color: theme.warn
		// 			text: qsTr("ip address must contain 4 parts.")
		// 		}
		// 	}

		// }

        ListView {
			id: controllerList
			model: service.controllers    
			width: contentItem.childrenRect.width + 5
			height: parent.height - 10

		    ScrollBar.vertical: ScrollBar {
				id: controllerListScrollBar
				anchors.left: parent.right
				width: 10
				visible: parent.height < parent.contentHeight
				policy: ScrollBar.AlwaysOn

				height: parent.availableHeight
				contentItem: Rectangle {
					radius: parent.width / 2
					color: theme.scrollBar
				}
			}

			delegate: Item {
				width: content.childrenRect.width + content.padding
            	height: content.childrenRect.height + content.padding
				property var controller: model.modelData.obj

				Rectangle {
					width: parent.width
					height: parent.height
					color: "#3baf29"
					radius: theme.radius
				}
				SIconButton{
                    id: iconButton
                    height: 40
                    width: 40
                    source: "qrc:/images/Resources/Icons/Material/settings_white_48dp.svg"
                    opacity: .4
                    anchors{
                        right: parent.right
                    }
                    
                    onClicked: {
                        menu.open() 
                    }
                }

                SContextMenu{
                    id: menu
                    //y: parent.width - menu.height
                    x: parent.width - 10
                    visible: menu.opened
                    MenuItem{
                        text: "Forget Controller"
                        onTriggered: {
                            console.log(`Removing Controller ${controller.id} from IP cache.`)
                            discovery.forgetController(controller.id)
                        }
                    }
                }
				Column {
					id: content
					width: childrenRect.width + content.padding * 2
					spacing: 10
					padding: 10

					Image {
						height: 50                
						source: "https://marketplace.signalrgb.com/brands/products/nanoleaf/dark_logo.png"
						fillMode: Image.PreserveAspectFit
						antialiasing: true
						mipmap:true
					}

					Text{
						color: theme.primarytextcolor
						text: controller.name
						font.pixelSize: 16
						font.family: "Poppins"
						font.bold: true
					}

					Text{
						color: theme.primarytextcolor
						text: `Id: ${controller.id} |  Model: ${controller.model}`
					}   

					Text{
						color: theme.primarytextcolor
						text: `Ip: ${controller.ip != "" ? controller.ip : "Unknown" } |  Firmware: ${controller.firmwareVersion}`
					}    
					Text{
						visible: controller.connected
						color: theme.primarytextcolor
						text: `Status: Linked`
					}   

					Item{
						height: 30
						width: parent.width
						visible: controller.currentlyValidatingIP

						Row{
							spacing: 5
							BusyIndicator {
								height: 30
								width: parent.height
								Material.accent: "#88FFFFFF"
							}
							Text{
								color: theme.primarytextcolor
								text: `Currently Validating IP Address...`
								anchors.verticalCenter: parent.verticalCenter
							}
						}
					}
					Item{
						height: 30
						width: parent.width
						visible: controller.currentlyResolvingIP

						Row{
							spacing: 5
							BusyIndicator {
								height: 30
								width: parent.height
								Material.accent: "#88FFFFFF"
							}
							Text{
								color: theme.primarytextcolor
								text: `Currently Resolving IP Address...`
								anchors.verticalCenter: parent.verticalCenter
							}
						}
					}

					Text{
						visible: controller.failedToValidateIP
						color: theme.warn
						width: parent.width - content.padding * 2
						text: `Failed to validate ip address. Are you sure it's there?`
						wrapMode: Text.WrapAtWordBoundaryOrAnywhere
					} 

					Item{
						visible: !controller.connected || controller.waitingforlink
						width: parent.width - content.padding * 2
						height: 50

						Rectangle {
							width: parent.width
							height: parent.height
							color: "#22ffffff"
							radius: 5
						}
						Text{
							height: parent.height
							x: 10
							color: theme.primarytextcolor
							verticalAlignment: Text.AlignVCenter
							text: (controller.connected === true) ? "Linked" : (controller.waitingforlink === true) ? "Waiting For Link..."+controller.retriesleft : "Not Linked"
						}
						ToolButton {        
							height: 50
							width: 120
							anchors.verticalCenter: parent.verticalCenter
							font.family: "Poppins"
							font.bold: true 
							visible: !controller.connected && !controller.waitingforlink  
							text: "Link"
							anchors.right: parent.right
							onClicked: {
								controller.startLink();
							}
						}
						BusyIndicator {
							y: 10
							height: 30
							width: parent.height
							Material.accent: "#88FFFFFF"
							anchors.right: parent.right
							visible: controller.waitingforlink === true
						}
					}    
					Text{
						width: parent.width
						color: theme.primarytextcolor
						verticalAlignment: Text.AlignVCenter
						visible: !controller.connected
						text: "To link this controller start the linking process above and then put the controller into pairing mode."
						wrapMode: Text.WrapAtWordBoundaryOrAnywhere
					}      
				}
			}  
        }
    }
}