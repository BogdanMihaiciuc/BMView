import { TWWidgetDefinition, TWService, TWProperty } from 'typescriptwebpacksupport/widgetRuntimeSupport'

//declare var BMLayoutConstraint: any;



/**
 * An interface representing the structure of serialized layout variables.
 */
export interface BMThingworxSerializedLayoutVariables {

    /**
     * A map of available layout variables and their default values.
     */
    variables: Dictionary<number>;

    /**
     * A map of variations where the keys represent size classes and their values are objects describing the variations per variable.
     */
    variations: Dictionary<Dictionary<number>>;
}

/**
 * Runtime widget view is a subclass of view used for Thingworx widgets that are not view aware.
 */
export class BMRuntimeWidgetView extends BMView {
    //@ts-ignore
    _contentNode: DOMNode;

    //@ts-ignore
    get contentNode() {
        return this._contentNode;
    }

    //@ts-ignore
    get debuggingName(): string {
        return this.widget.getProperty('DisplayName');
    }

    /**
     * The widget managed by this view.
     */
    widget: any;

    // @override - BMView
    boundsDidChangeToBounds(bounds: BMRect) {
        // Do not invoke any resize method on widgets that have been destroyed or
        // have their layouts managed by CoreUI views.
        if (!this.widget.jqElement || this.widget.coreUIView) return;

        // Let container widgets handle their responsive widgets, this will implicitly invoke the widget's own resize method
        if (this.widget.getWidgets().length) {
            this.widget.handleResponsiveWidgets(YES);
        }
        // Otherwise, directly invoke the resize method if the widget does not have sub-widgets
        else if (this.widget.resize) {
            this.widget.resize(bounds.size.width, bounds.size.height);
        }
    }
}


/**
 * Returns a view that will manage the given Thingworx widget.
 * The widget's sizing will be removed from its `jqElement`.
 * @param widget        The widget.
 * @return              A view.
 */
export function BMViewForThingworxWidget(widget: TWRuntimeWidget): BMView {
    let _widget: any = widget;

    let view: BMView;
    if (_widget.coreUIView) {
        // For widgets that supply their own view, don't modify their settings
        view = _widget.coreUIView;
    }
    else {
        view = BMView.viewForNode.call(BMRuntimeWidgetView, widget.boundingBox[0]);
        (view as BMRuntimeWidgetView).widget = widget;
        (view as any)._contentNode = widget.jqElement[0];

        /*
        Only allow intrinsic sizes for:
            * Label
            * Button
            * ValueDisplay
            * Image
        */
        switch (_widget.properties.__TypeDisplayName) {
            case 'Label':
                // label invalidates its intrinsic size whenever any bindable property is updated
                _widget._updateProperty = _widget.updateProperty;
                _widget.updateProperty = function (updatePropertyInfo: TWUpdatePropertyInfo) {
                    if (updatePropertyInfo.TargetProperty == 'Text' && updatePropertyInfo.SinglePropertyValue != this.getProperty('Text')) {
                        this._updateProperty.apply(this, arguments);
                        view.invalidateIntrinsicSize();
                    }
                    else {
                        this._updateProperty.apply(this, arguments);
                    }
                };
                (view as any).supportsAutomaticIntrinsicSize = YES;
                break;
            case 'Value Display':
                // Value display invalidates its intrinsic size whenever any bindable property is updated
                _widget._updateProperty = _widget.updateProperty;
                _widget.updateProperty = function (updatePropertyInfo: TWUpdatePropertyInfo) {
                    if (updatePropertyInfo.TargetProperty == 'Data' && updatePropertyInfo.SinglePropertyValue != this.getProperty('Data')) {
                        this._updateProperty.apply(this, arguments);
                        view.invalidateIntrinsicSize();
                    }
                    else {
                        this._updateProperty.apply(this, arguments);
                    }
                };
                (view as any).supportsAutomaticIntrinsicSize = YES;
                break;
            case 'Image':
                // For images, invalidate the intrinsic size whenever an image finishes loading
                _widget.jqElement[0].querySelectorAll('img')[0].onload = () => view.invalidateIntrinsicSize();
                (view as any).supportsAutomaticIntrinsicSize = YES;
                break;
            case 'Button':
                // Button has no bindable fields affecting the layout so it never invalidates it
                (view as any).supportsAutomaticIntrinsicSize = YES;
                break;
            case 'ExtendedButton':
                // Button has no bindable fields affecting the layout so it never invalidates it
                (view as any).supportsAutomaticIntrinsicSize = YES;
                break;
            case 'Collection View':
                _widget._updateProperty = _widget.updateProperty;
                _widget.updateProperty = async function (updatePropertyInfo: TWUpdatePropertyInfo, args: any) {
                    if (updatePropertyInfo.TargetProperty == 'Data') {
                        await this._updateProperty.apply(this, [updatePropertyInfo, args]);
                        view.invalidateIntrinsicSize();
                    }
                    else {
                        await this._updateProperty.apply(this, [updatePropertyInfo, args]);
                    }
                };
                (view as any).supportsAutomaticIntrinsicSize = NO;
                Object.defineProperty(view, 'intrinsicSize', {
                    get() {
                        if (!_widget.collectionView || !_widget.collectionView.dataSet) return BMSizeMake();
                        return _widget.collectionView.layout.contentSize();
                    }
                })
            default:
                (view as any).supportsAutomaticIntrinsicSize = NO;
                break;
        }

        /*view.didSetFrame = frame => {
            if (!_widget.jqElement) return;
            if (_widget.resize) {
                _widget.resize(frame.size.width, frame.size.height);
            }
            else {
                _widget.handleResponsiveWidgets(YES);
            }
        }*/
        

    }

    // Make jqElement have consistent sizing
    widget.jqElement[0].style.width = '100%';
    widget.jqElement[0].style.height = '100%';

    return view;
}


/**
 * The view widget allows the use of BMView and constraints based layouts in thingworx.
 * It also provides an editor that can be used to customize the layout.
 */
@TWWidgetDefinition
export class BMViewWidget extends TWRuntimeWidget {

    /**
     * Set to `YES` if this view is the page root view.
     */
    isRootView: boolean = NO;

    /**
     * Set to `YES` after this view is destroyed; prevents additional layout passes (e.g. if this view is deleted
     * while running an animation) from affecting its subwidgets.
     */
    destroyed: boolean = NO;

    /**
     * The CoreUI view managing this widget.
     */
    protected _coreUIView: BMView;
    get coreUIView(): BMView {
        if (!this._coreUIView) {
            let view = BMView.view();
            view.debuggingName = this.getProperty('DisplayName');
            view.supportsAutomaticIntrinsicSize = NO;
            this._coreUIView = view;
            view.node.classList.add('widget-content');
            view.node.classList.add('widget-bounding-box');
        }
        return this._coreUIView;
    }

    /**
     * A map containing the mapping between view IDs and view instances.
     * This is used when creating the constraints.
     */
    subviewMap: Dictionary<BMView> = {};

    serviceInvoked(name: string): void {
    }

    @TWProperty('_Constraints') 
    constraints: string;

    @TWProperty('_IntrinsicSizeResistances')
    intrinsicSizeResistances: string;

    @TWProperty('Style')
    set backgroundStyle(value: any) {
        let style = TW.getStyleFromStyleDefinition(value);

        if (style.backgroundColor) {
            this.coreUIView.node.style.backgroundColor = style.backgroundColor;
        }
        else {
            this.coreUIView.node.style.backgroundColor = 'transparent';
        }
    }

    @TWProperty('BoxShadow')
    boxShadow: string;

    @TWProperty('BorderRadius')
    borderRadius: string;

    @TWProperty('ClipsSubviews')
    clipsSubviews: boolean;

    @TWProperty('Cursor')
    cursor: string;

    @TWProperty('Visible')
    set visible(visible: boolean) {
        // When the visibility changes to true,
        // the intrinsic sizes of all of this view's subviews needs to be invalidated
        this.coreUIView.allSubviews.forEach(subview => {
            subview.invalidateIntrinsicSize();
            subview.needsLayout = YES;
        });
    }

    _RTLLayout: boolean = NO;

    @TWProperty('RightToLeftLayout')
    set RTLLayout(RTL: boolean) {
        if (typeof RTL === 'string') { // Fix for TW boolean bug
            RTL = (RTL == 'true' ? true : false);
        }

        // Do not process the undefined values that Thingworx often sends before
        // receiving the actual values
        if (typeof RTL === 'undefined') return;

        if (RTL != this._RTLLayout) {
            this._RTLLayout = RTL;

            BMAnimateWithBlock(() => {
                BMView.prototype.LTRLayout = !RTL;
                (this.coreUIView.rootView as any)._invalidatedConstraints = YES;
                this.coreUIView.layout();
            }, {
                duration: 300,
                easing: 'easeInOutQuad'
            });
        }
    }

    appendTo(container: $, mashup: any) {
        let widget = this as any;

        try {
            // Lazy way to skip verifying if this view has this many parents
            // In practice, because of how thingworx works, this block is likely to never throw
            this.isRootView = container[0].parentElement.parentElement.parentElement.id == 'actual-mashup';
            if (this.isRootView) {
                container[0].parentElement.style.overflow = 'hidden';
            }
            else {
                // If this view is the root of its mashup hierarchy, take over the resizing method
                if (container.data('widget').properties.__TypeDisplayName == 'Mashup') {
                    container.data('widget').handleResponsiveWidgets = () => {
                        if (!this.destroyed) this.coreUIView.layout();
                    }
                }
            }
        }
        catch (e) {
            // If the parent element nodes are null, rootView will remain NOs
        }

        if (this.isRootView) {
            window.addEventListener('resize', event => this.coreUIView.layout());
        }

        // Load the variables this view exports
        if (!this.coreUIView.superview) {
            if (this.getProperty('ExportsLayoutVariables')) {
                const parsedVariables = <BMThingworxSerializedLayoutVariables>JSON.parse(this.getProperty('_LayoutVariables') || '{"variables":{},"variations":{}}');


                for (const variable in parsedVariables.variables) {
                    BMView.registerLayoutVariableNamed(variable, {withValue: parsedVariables.variables[variable]});
                    // Remove any previously registered variations
                    BMView.removeVariationsForLayoutVariableNamed(variable);
                }

                for (const variation in parsedVariables.variations) {
                    for (const variable in parsedVariables.variations[variation]) {
                        if (variable == 'sizeClass') continue;
                        const sizeClass: BMLayoutSizeClass = (<any>BMLayoutSizeClass)._layoutSizeClassForHashString(variation);
                        BMView.setLayoutVariableValue(parsedVariables.variations[variation][variable], {named: variable, inSizeClass: sizeClass});
                    }
                }
            }
        }

		// Create a unique ID for this widget and assign it to the jqElementId property
		var ID = TW.Runtime.Workspace.Mashups.Current.rootName + "_" + widget.properties.Id;
		widget.jqElementId = ID;
		
		// Get the property attributes
		var runtimeProperties = widget.runtimeProperties();
		widget.propertyAttributes = runtimeProperties.propertyAttributes || {};
		
		// Data loading and error are never supported by this method
		runtimeProperties.needsDataLoadingAndError = NO;
		runtimeProperties.needsError = NO;
		widget.properties.ShowDataLoading = NO;
		
		// Set up the mashup reference
		widget.mashup = TW.Runtime.Workspace.Mashups.Current;
		widget.idOfThisMashup = TW.Runtime.HtmlIdOfCurrentlyLoadedMashup;
        widget.idOfThisElement = widget.properties.Id;

        BMView.prototype.LTRLayout = !this.RTLLayout;
        
        let view = this.coreUIView;
        // When Thingworx thinks that this view is a "responsive" widget, it will set the right and bottom
        // styles to 0 which will prevent automatic intrinsic size from working correctly
        view.node.style.right = 'unset';
        view.node.style.bottom = 'unset';
        view.node.id = ID;
        this.subviewMap[widget.properties.Id] = view;

        let jqElement = $(view.node);
        
        this.jqElement = jqElement;
        this.boundingBox = jqElement;
        jqElement.data('widget', this);

        // If this view doesn't have a superview, attach it to the document
        // Otherwise it will have already been added by the superview
        if (!view.superview) container[0].appendChild(view.node);

        if (widget.properties['Z-index']) {
			view.node.style.zIndex = Math.min(widget.properties['Z-index'] + 1500, 6500) + '';
        }

        view.node.style.borderRadius = this.borderRadius || '';
        view.node.style.boxShadow = this.boxShadow || '';
        view.node.style.overflow = (this.clipsSubviews ? 'hidden' : 'visible');
        view.node.style.cursor = this.cursor || 'auto';
        this.backgroundStyle = this.backgroundStyle;

        // Set the initial frame for this view, which is needed if this view doesn't have a complete layout defined by its constraints
        view.node.style.width = widget.properties.Width + 'px';
        view.node.style.height = widget.properties.Height + 'px';
        if ((window as any).BM_VIEW_USE_TRANSFORM) {
            view.node.style.left = '0px';
            view.node.style.top = '0px';
            BMHook(view.node, {translateX: widget.properties.Left + 'px', translateY: widget.properties.Top + 'px'});
        }
        else {
            view.node.style.left = widget.properties.Left + 'px';
            view.node.style.top = widget.properties.Top + 'px';
        }
        
        let subwidgets = this.getWidgets();
        subwidgets.forEach((subWidget: any) => {
            let subview = subWidget.coreUIView;
            if (subview) {
                // For CoreUI compliant widgets, add the subview then invoke appendTo
                // to let it set up the Thingworx-specific functionality
                view.addSubview(subview);
                subWidget.appendTo(jqElement);

                // After the widget is initialized, copy over its subview IDs
                if (subWidget.subviewMap) {
                    BMCopyProperties(this.subviewMap, subWidget.subviewMap);
                }
            }
            else {
                // For legacy widgets, first invoke their appendTo method, and create
                // the CoreUI view for it afterwards
                subWidget.appendTo(jqElement);
                subview = BMViewForThingworxWidget(subWidget);
                this.subviewMap[(subWidget as any).properties.Id] = subview;

                // Then attach their view as a subview of self
                this.coreUIView.addSubview(subview);
            }
        });

        // Finally, create the constraints
        JSON.parse(this.constraints || '[]').forEach(constraintDefinition => {
            let constraint = BMLayoutConstraint.constraintWithSerializedConstraint(constraintDefinition, {viewIDs: ID => this.subviewMap[ID]});
            // Skip constraints that are no longer valid
            if (!constraint) return;
            // The active state is now handled by the serialization process
            //constraint.isActive = YES;
        });

        // And the intrinsic size resistances
        let intrinsicSizeResistances = JSON.parse(this.intrinsicSizeResistances || '{}');
        Object.keys(intrinsicSizeResistances).forEach(ID => {
            let view = this.subviewMap[ID];
            // Skip views that no longer exist
            if (!view) return;

            let anyView = view as any;
            view.compressionResistance = intrinsicSizeResistances[ID].compressionResistance;
            view.expansionResistance = intrinsicSizeResistances[ID].expansionResistance;
            view.opacity = ('opacity' in intrinsicSizeResistances[ID] ? intrinsicSizeResistances[ID].opacity : 1);
            anyView.isVisible = ('isVisible' in intrinsicSizeResistances[ID] ? intrinsicSizeResistances[ID].isVisible : YES);
            anyView.CSSClass = ('CSSClass' in intrinsicSizeResistances[ID] ? intrinsicSizeResistances[ID].CSSClass : '');
            anyView._serializedVariations = ('variations' in intrinsicSizeResistances[ID] ? intrinsicSizeResistances[ID].variations : {});
        });

        if (this.coreUIView.isRootView) {
            (<any>this.coreUIView)._invalidatedSizeClasses = YES;
            (<any>this.coreUIView)._updateSizeClasses();

            // Run an initial layout pass if this view is the root view (and not part of another view hierarchy e.g. a collection view cell)
            if (!this.coreUIView.superview && !(<any>this)._skipInitialLayoutPass) {
                this._coreUIView.layout();
            }

            // Invalidate the intrinsic sizes of all subviews before the initial layout pass
            requestAnimationFrame(_ => {
                if (this._coreUIView.superview) return;
                this.coreUIView.allSubviews.forEach(view => view.invalidateIntrinsicSize());
                (this.coreUIView as any)._invalidatedConstraints = YES;
            });
        }
    }

    handleResponsiveWidgets() {
        if (this.isRootView || this.destroyed) return;
        if (this.coreUIView.isRootView) {
            this.coreUIView.layout();

            this.getWidgets().forEach(subWidget => subWidget.handleResponsiveWidgets(YES));
        }
    }

    standardUpdateProperty(updatePropertyInfo: TWUpdatePropertyInfo): void {
        // Copy pasted from TW.Runtime.Widget
        if (updatePropertyInfo.TargetProperty === 'Visible') {
            if (String(updatePropertyInfo.SinglePropertyValue) === "true") {
                this.boundingBox.show();
                this.setProperty('Visible', true);
                this.visible = YES;
            } else {
                this.boundingBox.hide();
                this.setProperty('Visible', false);
            }
        } else {
            if (updatePropertyInfo.TargetProperty === 'CustomClass') {
                return super.standardUpdateProperty(updatePropertyInfo);
            }
            if (this.updateProperty !== undefined) {
                this.updateProperty(updatePropertyInfo);
            }
        }
        //return super.standardUpdateProperty(updatePropertyInfo);
    }

    // NOTE: renderHtml is NOT used by BMViewWidget
    renderHtml(): string {
        return '';
    };


    // NOTE: afterRender is NOT used by BMViewWidget
    afterRender(): void {
    }

    _layoutUpdates: Dictionary<number> = {};

    _layoutUpdateIdentifier: number;

    updateProperty(info: TWUpdatePropertyInfo): void {
        // UpdatePropertyInfo is used solely for bindable constraint constants
        if (!(<any>this)._decoratedProperties[info.TargetProperty]) {
            // Check to see if this update applies directly to a constraint constant or one of its variations
            let hasVariation = info.TargetProperty.indexOf('[') != -1;
            let sizeClass: BMLayoutSizeClass | undefined;
            let constraintIdentifier = info.TargetProperty;

            // If this binding applies to a variation, extract the constraint identifier and size class hash string from the "property name"
            if (hasVariation) {
                sizeClass = (<any>BMLayoutSizeClass)._layoutSizeClassForHashString(info.TargetProperty.substring(info.TargetProperty.indexOf('['), info.TargetProperty.length - 1));
                constraintIdentifier = info.TargetProperty.substring(0, info.TargetProperty.indexOf('['));
            }

            let constraint = this.coreUIView.rootView.constraintWithIdentifier(constraintIdentifier);

            if (constraint) {
                // Thingworx often dispatches this value as a string even when passed as a number
                const constraintConstant = parseFloat(info.SinglePropertyValue);
                this._layoutUpdates[info.TargetProperty] = isNaN(constraintConstant) ? info.SinglePropertyValue : constraintConstant;

                // When the binding is updated, save the pending value and apply it after a short delay
                // This is used to batch together several updates that may be dispatched at the same time,
                // e.g. a service returning several constants at the same time
                if (!this._layoutUpdateIdentifier) {
                    this._layoutUpdateIdentifier = window.setTimeout(() => {
                        // When the timeout expires, run through and apply all of the pending changes
                        let layoutUpdates = this._layoutUpdates;
                        this._layoutUpdateIdentifier = undefined;
                        this._layoutUpdates = {};
                        for (let key in layoutUpdates) {
                            // Perform the same set of verifications upon updating the layout
                            let hasVariation = key.indexOf('[') != -1;
                            let sizeClass: BMLayoutSizeClass | undefined;
                            let constraintIdentifier = key;
                            
                            if (hasVariation) {
                                sizeClass = (<any>BMLayoutSizeClass)._layoutSizeClassForHashString(key.substring(info.TargetProperty.indexOf('['), key.length - 1));
                                constraintIdentifier = info.TargetProperty.substring(0, key.indexOf('['));
                            }

                            let constraint = this.coreUIView.rootView.constraintWithIdentifier(constraintIdentifier);

                            if (constraint) {
                                if (sizeClass) {
                                    constraint.setConstant(layoutUpdates[key], {forSizeClass: sizeClass});
                                }
                                else {
                                    constraint.constant = layoutUpdates[constraintIdentifier];
                                }
                            }
                        }

                        // Apply the changes in an animation block after preparing them
                        BMAnimateWithBlock(() => this.coreUIView.layoutQueue.dequeue(), {duration: 300, easing: 'easeInOutQuad'});
                    }, 0);
                }
            }
        }
    }

    //@override
    destroy() {
        this.destroyed = YES;

        try {
            for (let widget of this.getWidgets()) widget.destroy();
        }
        catch (err) {

        }

		// NOTE: The following unsupported features are not handled by View's destructor:
		// * Tooltips
		// * Popups & Popup overlays
		// * jQuery element purging
		// * Unnecessary property deletions

        this.beforeDestroy();
        
        if (this.coreUIView.superview) {
            this.coreUIView.superview.removeSubview(this.coreUIView);
        }
		
		this.jqElement.remove();
    }

    // NOTE: beforeDestroy is NOT used by BMViewWidget
    beforeDestroy?(): void {
    }
}

/**
 * The scroll view widget is a subclass of the view widget that allows the creation of
 * constraint based scrolling containers.
 */
@TWWidgetDefinition
export class BMScrollViewWidget extends BMViewWidget {

    styleRule: DOMNode;

    /**
     * The CoreUI view managing this widget.
     */
    //@ts-ignore
    protected _coreUIView: BMScrollView;
    get coreUIView(): BMScrollView {
        if (!this._coreUIView) {
            let view = BMScrollView.scrollView();
            view.debuggingName = this.getProperty('DisplayName');
            this._coreUIView = view;
            view.node.classList.add('widget-content');
            view.node.classList.add('widget-bounding-box');
        }
        return this._coreUIView;
    }

    appendTo(container: $, mashup: TWMashup): void {
        super.appendTo(container, mashup);
        this.subviewMap[(this as any).properties.Id + '-content-view'] = this.coreUIView.contentView;
		if (this.getProperty('ScrollbarStyle')) {
            let scrollbarCSS;
			let scrollbarStyle = TW.getStyleFromStyleDefinition(this.getProperty('ScrollbarStyle'));
			let scrollbarTrackStyle = TW.getStyleFromStyleDefinition(this.getProperty('ScrollbarTrackStyle'));

			let indicatorCSSRule = {
				'box-sizing': 'border-box',
				'background-color': scrollbarStyle.backgroundColor,
				'border-radius': this.getProperty('ScrollbarBorderRadius') + 'px'
			};

			if (scrollbarStyle.lineColor) {
				BMCopyProperties(indicatorCSSRule, {
					'border-width': scrollbarStyle.lineThickness + 'px',
					'border-style': scrollbarStyle.lineStyle,
					'border-color': scrollbarStyle.lineColor
				});
			}
			else {
				BMCopyProperties(indicatorCSSRule, {
					'border-width': '0px',
					'border-style': 'none',
					'border-color': 'transparent'
				});
			}

			let indicatorCSS = BMCSSRuleWithSelector('#' + (this as any).jqElementId + ' .iScrollIndicator', {important: YES, properties: indicatorCSSRule});
			let indicatorWidthCSS = '#' + (this as any).jqElementId + ' .iScrollVerticalScrollbar { width: ' + this.getProperty('ScrollbarWidth') + 'px !important; }\n';
			let indicatorHeightCSS = '#' + (this as any).jqElementId + ' .iScrollHorizontalScrollbar { height: ' + this.getProperty('ScrollbarWidth') + 'px !important; }\n';

			scrollbarCSS = indicatorCSS + indicatorWidthCSS + indicatorHeightCSS;

			if (scrollbarTrackStyle) {
				let trackCSSRule = {
					'box-sizing': 'border-box',
					'background-color': scrollbarTrackStyle.backgroundColor,
					'border-radius': this.getProperty('ScrollbarBorderRadius') + 'px'
				};
	
				if (scrollbarTrackStyle.lineColor) {
					BMCopyProperties(trackCSSRule, {
						'border-width': scrollbarTrackStyle.lineThickness + 'px',
						'border-style': scrollbarTrackStyle.lineStyle,
						'border-color': scrollbarTrackStyle.lineColor
					});
				}
				else {
					BMCopyProperties(trackCSSRule, {
						'border-width': '0px',
						'border-style': 'none',
						'border-color': 'transparent'
					});
				}

				scrollbarCSS += BMCSSRuleWithSelector('#' + (this as any).jqElementId + ' .iScrollVerticalScrollbar, #' + (this as any).jqElementId + ' .iScrollVerticalScrollbar', {important: YES, properties: trackCSSRule});
            }
            
            this.styleRule = document.createElement('style');
            this.styleRule.innerHTML = scrollbarCSS;
            document.head.appendChild(this.styleRule);
		}
    }

    beforeDestroy(): void {
        if (this.styleRule) this.styleRule.remove();

        super.beforeDestroy();
    }
}

/**
 * The layout guide widget is a subclass of the view widget that allows the creation of
 * views whose position can be changed by users at runtime via drag & drop.
 */
@TWWidgetDefinition
export class BMLayoutGuideWidget extends BMViewWidget {

    @TWProperty('InitialPositionLeft')
    initialPositionLeft: number;

    @TWProperty('InitialPositionTop')
    initialPositionTop: number;

    /**
     * The CoreUI view managing this widget.
     */
    //@ts-ignore
    protected _coreUIView: BMLayoutGuide;
    get coreUIView(): BMLayoutGuide {
        if (!this._coreUIView) {
            let view = BMView.view.call(BMLayoutGuide);
            view.debuggingName = this.getProperty('DisplayName');
            this._coreUIView = view;
            view.node.classList.add('widget-content');
            view.node.classList.add('widget-bounding-box');

            (view as any).initialPosition = BMPointMake(this.initialPositionLeft || 0, this.initialPositionTop || 0);
        }
        return this._coreUIView;
    }
}

interface Number {
    // Thingworx extension
    format(format: string): string;
}

/**
 * Returns a string that represents the formatted representation of the given number.
 * @param number The number.
 * @param format The format string.
 */
function BMStringWithNumber(number: any, {usingFormat: format}: {usingFormat?: string}): string {
    return format ? number.format(format) : number.toString();
}


/**
 * Returns a string that represents the formatted representation of the given date.
 * @param date      The number.
 * @param format    The format string.
 */
function BMStringWithDate(date: Date | number, {usingFormat: format}: {usingFormat?: string}): string {
    if (typeof date === 'number') {
        date = new Date(date);
    }

    return format ? TW.DateUtilities.formatDate(date, format) : date.toString();
}

function BMStringWithLocation(location: {latitude: any, longitude: any}, {usingFormat: format}: {usingFormat?: string}): string {
    return format ? `${location.latitude.format(format)} : ${location.longitude.format(format)}` : `${location.latitude.toString()} : ${location.longitude.toString()}`;
}

/**
 * The attributed label view widget is a subclass of the view widget that allows the creation of labels
 * that contain customizable arguments that can be bound independently.
 */
@TWWidgetDefinition
export class BMAttributedLabelViewWidget extends BMViewWidget {
    
    /**
     * The CoreUI view managing this widget.
     */
    //@ts-ignore
    protected _coreUIView: BMAttributedLabelView;
    get coreUIView(): BMAttributedLabelView {
        if (!this._coreUIView) {
            let view = BMAttributedLabelView.labelViewWithTemplate(TW.Runtime.convertLocalizableString(this.getProperty('Template')));
            view.node.style.boxSizing = 'border-box';
            view.debuggingName = this.getProperty('DisplayName');
            this._coreUIView = view;
            view.node.classList.add('widget-content');
            view.node.classList.add('widget-bounding-box');
            view.node.style.lineHeight = this.getProperty('LineHeight') || 'auto';

            // Apply the properties
            this.applyValue(this.getProperty('Padding'), {toPropertyNamed: 'Padding'});

            for (let argument in view.arguments) {
                view.arguments[argument].value = this.getProperty(argument) || `[[${argument}]]`;
                this.applyValue(this.getProperty('Style:' + argument), {toPropertyNamed: 'Style:' + argument});
                this.applyValue(this.getProperty('BorderRadius:' + argument), {toPropertyNamed: 'BorderRadius:' + argument});
                this.applyValue(this.getProperty('BoxShadow:' + argument), {toPropertyNamed: 'BoxShadow:' + argument});
                this.applyValue(this.getProperty('Margin:' + argument), {toPropertyNamed: 'Margin:' + argument});
                this.applyValue(this.getProperty('Padding:' + argument), {toPropertyNamed: 'Padding:' + argument});
            }
        }
        return this._coreUIView;
    }

    appendTo(container: any, mashup: any) {
        super.appendTo(container, mashup);
        this.backgroundStyle = this.getProperty('Style');
    }

    // @override - BMViewWidget
    updateProperty(info: TWUpdatePropertyInfo) {
        super.updateProperty(info);

        if (info.TargetProperty == 'Template') {
            this.coreUIView.template = TW.Runtime.convertLocalizableString(info.SinglePropertyValue);
        }
        else if (info.TargetProperty.startsWith('Argument:')) {
            let argumentName = info.TargetProperty.substring(9);

            if (argumentName in this.coreUIView.arguments) {
                let argument = this.coreUIView.arguments[argumentName];

                // Apply the state formatting and renderer format, if it changed
                // Label View already handles the cases where the styles are equal, so it is
                // acceptable to reapply all styles
                let state = this.getProperty('State:' + argumentName);

                // Undefined and null will throw exceptions during conversions, so they are converted to empty strings
                let value = info.SinglePropertyValue;
                if (value === void 0 || value === null) {
                    value = '';
                }

                if (state) {
                    let formatString = state.FormatString ? TW.Runtime.convertLocalizableString(state.FormatString) : state.FormatString;
                    // Check whether a non-default renderer is used
                    if (state.renderer == 'DEFAULT') {
                        argument.value = value;
                    }
                    else {
                        // Otherwise apply the renderer formatting
                        // Note that label view widget does not use Thingworx renderers directly, as they introduce a
                        // large amount of boilerplate DOM nodes, which would affect the performance of label view
                        switch (state.renderer) {
                            case 'NUMBER':
                            case 'LONG':
                            case 'INTEGER':
                                argument.value = BMStringWithNumber(parseFloat(value), {usingFormat: formatString});
                                break;
                            case 'DATETIME':
                                argument.value = BMStringWithDate(value, {usingFormat: formatString});
                                break;
                            case 'LOCATION':
                                argument.value = BMStringWithLocation(value, {usingFormat: formatString});
                                break;
                            case 'STRING':
                                let formattedValue = value;
                                // NOTE: Copy-pasted from Thingworx
                                if (formatString != 'full') {
                                    var maxSize = 40;

                                    if (formatString === 'notext') {
                                        maxSize = 0;
                                    }
                                    else if (formatString === 'limit10') {
                                        maxSize = 10;
                                    }
                                    else if (formatString === 'limit20') {
                                        maxSize = 20;
                                    }
                                    else if (formatString === 'limit40') {
                                        maxSize = 40;
                                    }
                                    else if (formatString === 'limit80') {
                                        maxSize = 80;
                                    }
                                    else if (formatString === 'limit128') {
                                        maxSize = 128;
                                    }
                                    else if (formatString === 'limit256') {
                                        maxSize = 256;
                                    }

                                    if (state.Value !== undefined) {
                                        if (state.Value.length > maxSize) {
                                            formattedValue = state.Value.substring(0, maxSize - 3) + "...";
                                        }
                                    }

                                    if (state.FormatString === 'notext') {
                                        formattedValue = '';
                                    }
                                }
                                argument.value = formattedValue;
                                break;
                            default:
                                // Additional renderers require HTML, so they are downgraded back to toString
                                argument.value = value.toString();
                        }
                    }

                    // Check whether there is a state-based formatting available
                    // If there is, apply it
                    if (state.formatInfo.StateDefinitionType != 'fixed') {
                        let style = TW.getStyleFromStateFormatting({DataRow: info.ActualDataRows[0], StateFormatting: state.formatInfo});
                        if (style) {
                            // Check whether style inheriting is enabled for this argument
                            if (this.getProperty('StateExtendsStyle:' + argumentName)) {
                                let baseStyle = this.getProperty('Style:' + argumentName);
                                if (baseStyle) {
                                    // If style inheriting is enabled and there is a base style
                                    // Create the composed style and enable it
                                    baseStyle = TW.getStyleFromStyleDefinition(baseStyle);
                                    let composedStyle = BMCopyProperties({}, baseStyle);
                                    composedStyle.backgroundColor = style.backgroundColor ? style.backgroundColor : composedStyle.backgroundColor;
                                    composedStyle.foregroundColor = style.foregroundColor ? style.foregroundColor : composedStyle.foregroundColor;
                                    composedStyle.lineColor = style.lineColor ? style.lineColor : composedStyle.lineColor;
                                    
                                    this.applyValue(composedStyle, {toPropertyNamed: 'Style:' + argumentName});
                                }
                                else {
                                    // If the base style is not defined, apply the state directly
                                    this.applyValue(style, {toPropertyNamed: 'Style:' + argumentName});
                                }
                            }
                            else {
                                // If it is not enabled, apply the state directly
                                this.applyValue(style, {toPropertyNamed: 'Style:' + argumentName});
                            }
                        }
                    }
                }
                else {
                    // If no renderer or state formatting have been defined, just update the value
                    argument.value = value;
                }
            }
        }
        else if (info.TargetProperty.startsWith('Style:')) {
            return this.applyValue(info.SinglePropertyValue, {toPropertyNamed: info.TargetProperty});
        }
    }

    // @override - BMViewWidget
    set backgroundStyle(value: any) {
        let styleDefinition = TW.getStyleFromStyleDefinition(value);
        let style = {};
        if (value) {
            let fontSize = TW.getTextSize(styleDefinition.textSize);
            fontSize = fontSize.substring(fontSize.indexOf(':') + 1, fontSize.length - 1);
            BMCopyProperties(style, {
                backgroundColor: styleDefinition.backgroundColor || 'transparent',
                color: styleDefinition.foregroundColor || styleDefinition.color || 'inherit',
                borderWidth: (styleDefinition.lineThickness || 0) + 'px',
                borderStyle: styleDefinition.lineStyle || 'none',
                borderColor: styleDefinition.lineColor || 'transparent',
                backgroundClip: styleDefinition.lineColor ? 'padding-box' : '',
                fontSize: fontSize.trim(),
                fontWeight: styleDefinition.fontEmphasisBold ? 'bold' : 'normal',
                fontStyle: styleDefinition.fontEmphasisItalic ? 'italic' : 'normal',
                textDecoration: styleDefinition.fontEmphasisUnderline ? 'underline' : 'none'
            });
            BMCopyProperties(this.coreUIView.node.style, style);
        }
        else {
            this.coreUIView.node.style.removeProperty('backgroundColor');
            this.coreUIView.node.style.removeProperty('color');
            this.coreUIView.node.style.removeProperty('borderColor');
            this.coreUIView.node.style.removeProperty('borderStyle');
            this.coreUIView.node.style.removeProperty('borderWidth');
            this.coreUIView.node.style.removeProperty('fontSize');
            this.coreUIView.node.style.removeProperty('fontWeight');
            this.coreUIView.node.style.removeProperty('fontStyle');
            this.coreUIView.node.style.removeProperty('textDecoration');
            BMCopyProperties(this.coreUIView.node.style, style);
        }
    }

    // NOTE: largely copy-pasted from ide.ts
    applyValue(value: any, {toPropertyNamed: name}: {toPropertyNamed: string}): void {
        if (name == 'Padding') {
            this.coreUIView.contentNode.style.padding = value;
        }

        if (name.startsWith('Style:')) {
            let argument = name.substring(6);

            if (argument in this.coreUIView.arguments) {
                let styleDefinition = TW.getStyleFromStyleDefinition(value);
                let style = BMCopyProperties({}, this.coreUIView.arguments[argument].style || {});
                if (value) {
                    let fontSize = TW.getTextSize(styleDefinition.textSize);
                    fontSize = fontSize.substring(fontSize.indexOf(':') + 1, fontSize.length - 1);
                    BMCopyProperties(style, {
                        backgroundColor: styleDefinition.backgroundColor || 'transparent',
                        color: styleDefinition.foregroundColor || styleDefinition.color || 'inherit',
                        borderWidth: styleDefinition.lineColor ? (styleDefinition.lineThickness || 0) + 'px' : 'none',
                        borderStyle: styleDefinition.lineColor ? styleDefinition.lineStyle || 'none' : 'none',
                        borderColor: styleDefinition.lineColor || 'transparent',
                        backgroundClip: styleDefinition.lineColor ? 'padding-box' : '',
                        boxSizing: 'border-box',
                        fontSize: fontSize.trim(),
                        fontWeight: styleDefinition.fontEmphasisBold ? 'bold' : 'normal',
                        fontStyle: styleDefinition.fontEmphasisItalic ? 'italic' : 'normal',
                        textDecoration: styleDefinition.fontEmphasisUnderline ? 'underline' : 'none'
                    });
                    this.coreUIView.arguments[argument].style = style;   
                }
                else {
                    delete style.backgroundColor;
                    delete style.color;
                    delete style.borderColor;
                    delete style.borderStyle;
                    delete style.borderWidth;
                    delete style.fontSize;
                    delete style.fontWeight;
                    delete style.fontStyle;
                    delete style.textDecoration;
                    this.coreUIView.arguments[argument].style = style;
                }
            }
        }

        if (name.startsWith('BoxShadow:')) {
            let argument = name.substring(10);

            if (argument in this.coreUIView.arguments) {
                let style = BMCopyProperties({}, this.coreUIView.arguments[argument].style || {});
                if (value) {
                    style.boxShadow = value;
                    this.coreUIView.arguments[argument].style = style;   
                }
                else {
                    delete style.boxShadow;
                    this.coreUIView.arguments[argument].style = style;
                }
            }
        }

        if (name.startsWith('BorderRadius:')) {
            let argument = name.substring(13);

            if (argument in this.coreUIView.arguments) {
                let style = BMCopyProperties({}, this.coreUIView.arguments[argument].style || {});
                if (value) {
                    style.borderRadius = value;
                    this.coreUIView.arguments[argument].style = style;   
                }
                else {
                    delete style.borderRadius;
                    this.coreUIView.arguments[argument].style = style;
                }
            }
        }

        if (name.startsWith('Padding:')) {
            let argument = name.substring(8);

            if (argument in this.coreUIView.arguments) {
                let style = BMCopyProperties({}, this.coreUIView.arguments[argument].style || {});
                if (value) {
                    style.padding = value;
                    this.coreUIView.arguments[argument].style = style;   
                }
                else {
                    delete style.boxShadow;
                    this.coreUIView.arguments[argument].style = style;
                }
            }
        }

        if (name.startsWith('Margin:')) {
            let argument = name.substring(7);

            if (argument in this.coreUIView.arguments) {
                let style = BMCopyProperties({}, this.coreUIView.arguments[argument].style || {});
                if (value) {
                    style.margin = value;
                    this.coreUIView.arguments[argument].style = style;   
                }
                else {
                    delete style.borderRadius;
                    this.coreUIView.arguments[argument].style = style;
                }
            }
        }
    }

}

/**
 * The text field widget is a subclass of the view widget that allows the creation of text fields that support
 * automatic completion and suggestions.
 */
@TWWidgetDefinition
export class BMTextFieldWidget extends BMViewWidget implements BMTextFieldDelegate {

    /**
     * The text field's current value.
     */
    @TWProperty('Value') value: string;

    /**
     * An optional list of suggestions to use for autocompletion.
     */
    @TWProperty('Suggestions') data?: TWInfotable;

    /**
     * When suggestions are used, this represents the infotable field containing the suggestions.
     */
    @TWProperty('SuggestionField') suggestionField: string;

    /**
     * When enabled, the suggestions will be displayed in a drop down menu while the text field is focused.
     */
    @TWProperty('ShowsSuggestionsDropdown') showsDropdown: boolean;

    /**
     * When enabled, the closest suggestion will be automatically completed while the user types in the text field.
     */
    @TWProperty('AutoCompletes') autoCompletes: boolean;

    /**
     * When enabled, whenever this text field's value matches a suggestion, the row containing that suggestion will be selected.
     */
    @TWProperty('SelectsSuggestion') selectsSuggestion: boolean;

    /**
     * This text field's input element.
     */
    private _input!: HTMLInputElement;

    /**
     * The CoreUI view managing this widget.
     */
    //@ts-ignore
    protected _coreUIView: BMTextField;
    get coreUIView(): BMTextField {
        if (!this._coreUIView) {
            let view = BMTextField.textField();
            view.debuggingName = this.getProperty('DisplayName');
            this._coreUIView = view;
            view.node.classList.add('widget-content');
            view.node.classList.add('widget-bounding-box');

            view.node.addEventListener('focus', e => this.jqElement.triggerHandler('TextFieldDidAcquireFocus'));
            view.node.addEventListener('blur', e => this.jqElement.triggerHandler('TextFieldDidResignFocus'));

            view.delegate = this;
            this._input = view.node as HTMLInputElement;
        }
        return this._coreUIView;
    }
    
    textFieldSuggestionsForText(textField: BMTextField, text: string): string[] {
        if (this.data) {
            return this.data.rows.map(d => d[this.suggestionField]);
        }
        return [];
    }
    
    textFieldShouldShowSuggestions(textField: BMTextField): boolean {
        return this.showsDropdown;
    }
    
    textFieldShouldAutocompleteText(textField: BMTextField, text: string, {withSuggestion}: {withSuggestion: string}) {
        return this.autoCompletes;
    }
    
    textFieldContentsDidChange(textField: BMTextField) {
        if (this.data && this.selectsSuggestion) {
            const index = this.data.rows.findIndex(d => d[this.suggestionField] == this._input.value);
            if (index != -1) {
                this.updateSelection('Suggestions', [index]);
            }
        }
        this.value = this._input.value;
        this.jqElement.triggerHandler('ContentsDidChange');
    }
    
    textFieldShouldReturn(textField: BMTextField) {
        this.jqElement.triggerHandler('ReturnPressed');
        return YES;
    }

}


/**
 * Returns the widget with the specified id by searching the target mashup.
 * {
 * 	@param withId <String, nullable> 					Required if named is not specified. The ID of the widget to find
 * 	@param named <String, nullable>						The display name of the widget, if specified, the search will find the first widget 
 *														that has the specified id (if given) or the speficied display name.
 * 	@param inMashup <TWMashup>							The mashup object in which to search.
 * 	@param traverseContainedMashup <Boolean, nullable> 	Defaults to false. If set to true, the search will include other mashups contained within the source mashup.
 * }
 * @return <TWWidget, nullable> 						The actual widget object if found, null otherwise
 */
 function BMFindWidget(args) {
	var id = args.withId;
	var mashup = args.inMashup;
	var name = args.named;
	
	if (!mashup) mashup = TW.Runtime.Workspace.Mashups.Current;
	
	return BMFindWidgetRecursive(id, name, mashup.rootWidget, args.traverseContainedMashup);
}

function BMFindWidgetRecursive(id, name, container, includeContainedMashup) {
	
	var widgets = container.getWidgets();
	var length = widgets.length;
	
	for (var i = 0; i < length; i++) {
		var widget = widgets[i];
		
		if (widget.idOfThisElement == id || widget.properties.Id == id) return widget;
		if (widget.properties.DisplayName == name) return widget;
		
		var subWidgets = widget.getWidgets();
		if (widget.properties.__TypeDisplayName == "Contained Mashup" && !includeContainedMashup) continue;
		if (subWidgets.length > 0) {
			widget = BMFindWidgetRecursive(id, name, widget, includeContainedMashup);
			
			if (widget) return widget;
		}
		
		
	}
	
	return null;
	
}

/**
 * An extension of the keyboard shortcut class that allows specifying a name.
 */
interface BMNamedKeyboardShortcut extends BMKeyboardShortcut {
    /**
     * The name of this keyboard shortcut.
     */
    name?: string;
}


/**
 * The keyboard shortcut controller widget is a controller widget that can be used to add keyboard shortcuts to widgets
 * or the entire document.
 */
 @TWWidgetDefinition
 export class BMKeyboardShortcutController extends TWRuntimeWidget {
 
    /**
     * The target to which the shortcuts apply.
     */
    @TWProperty('Target') target: string;

    /**
     * When target is "Widget", this is the display name of the widget to which the shortcuts should apply.
     */
    @TWProperty('TargetWidget') targetWidget?: string;

    /**
     * A JSON array string representing the configured keyboard shortcut.
     */
    @TWProperty('_KeyboardShortcutConfiguration') keyboardShortcutConfiguration: string;

    /**
     * The keyboard shortcuts that should be registered.
     */
    private keyboardShortcuts: BMNamedKeyboardShortcut[] = [];

    /**
     * The target node to which the keyboard shortcuts will be attached.
     */
    private targetNode: DOMNode;

    renderHtml() {
        return `<div class="widget-content"></div>`;
    }
 
    afterRender() {
        this.boundingBox[0].style.display = 'none';
        try {
            JSON.parse(this.keyboardShortcutConfiguration).forEach(k => {
                const shortcut = BMKeyboardShortcut.keyboardShortcutWithSerializedKeyboardShortcut(k, {targetID: () => this});
                shortcut.name = k._name;
                this.keyboardShortcuts.push(shortcut);
            });
        }
        catch (e) {
            // An error is most likely a badly formatted json, log and ignore
            console.error(e);
        }

        // Find the target node
        if (this.target == 'Document') {
            this.targetNode = window.document.body;
        }
        else if (this.target == 'Widget') {
            const widget = BMFindWidget({named: this.targetWidget, inMashup: this.mashup}) as TWRuntimeWidget;
            if (widget) {
                this.targetNode = widget.boundingBox[0];
            }
        }

        // Register the keyboard shortcuts if a target node was found
        if (this.targetNode) {
            for (const shortcut of this.keyboardShortcuts) {
                BMView.registerKeyboardShortcut(shortcut, {forNode: this.targetNode});
            }
        }
    }

    /**
     * Invoked when any keyboard shortcut is triggered. Triggers the associated mashup event.
     * @param event         The keyboard event that triggered this action.
     * @param shortcut      The keyboard shortcut that was triggered. 
     */
    shortcutTriggeredWithEvent(event: KeyboardEvent, {forKeyboardShortcut: shortcut}: {forKeyboardShortcut: BMNamedKeyboardShortcut}): void {
        this.jqElement.triggerHandler('Shortcut:' + shortcut.name);
    }

    beforeDestroy() {
        if (this.targetNode) {
            this.keyboardShortcuts.forEach(k => BMView.unregisterKeyboardShortcut(k, {forNode: this.targetNode as DOMNode}));
        }
    }
 
 }