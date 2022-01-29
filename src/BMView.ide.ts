////<reference path="../node_modules/bm-core-ui/lib/@types/BMCoreUI.min.d.ts"/>
///<reference path="../../BMCoreUI/build/ui/BMCoreUI/BMCoreUI.d.ts"/>

// automatically import the css file
import { TWWidgetDefinition } from 'typescriptwebpacksupport/widgetIDESupport'

/**
 * Should be set to `YES` to enable editing widget properties.
 */
const USE_WIDGET_PROPERTIES = NO;

export class BMThingworxLayoutEditor extends BMViewLayoutEditor {
    bindableConstraints: Set<string> = new Set;

    createAdditionalSettingsForConstraint(constraint, {withReferenceView: view, inContainer: container}: {withReferenceView: BMView, inContainer: DOMNode}) {
        container.appendChild(this.booleanSettingWithName('Bindable:', {value: this.bindableConstraints.has(constraint.identifier), changeHandler: (value: boolean) => {
            if (value) {
                this.bindableConstraints.add(constraint.identifier);
            }
            else {
                this.bindableConstraints.delete(constraint.identifier);
            }
        }}));

        container.appendChild(this.textSettingWithName('Identifier:', {value: constraint.identifier, changeHandler: (value: string): boolean => {
            if (this.view.constraintWithIdentifier(value)) return NO;

            if (this.bindableConstraints.has(constraint.identifier)) {
                this.bindableConstraints.delete(constraint.identifier);
                this.bindableConstraints.add(value);
            }
            constraint._identifier = value;

            return YES;
        }}));

        container.appendChild(this.settingsDivider());
    }

    dismissAnimated(animated, args) {
        document.body.classList.remove('BMViewEditorOpen');
        return super.dismissAnimated(animated, args);
    }
}

const EXTENSION_MODE = NO;

declare var BMLayoutConstraint: any;

declare global {
     interface Window {
        _BMLayoutVariableProviders: Dictionary<BMThingworxRemoteLayoutVariableProvider>;
    }
}

window._BMLayoutVariableProviders = {};

interface BMLayoutVariableVariationMutable extends BMLayoutVariableVariation {
    value: number;
}

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
 * The Thingworx-specific implementation of a layout variable provider.
 */
export class BMThingworxLayoutVariableProvider implements BMLayoutVariableProvider {
    /**
     * The `BMView` widget using this layout variable provider.
     */
    widget?: BMViewWidget;

    /**
     * The source layout variable provider for which this provider is a proxy, if applicable.
     * If this is set, this provider will forward all method invocations to this object.
     */
    sourceLayoutProvider?: BMLayoutVariableProvider;

    /**
     * The available layout variables.
     */
    private _variables: Dictionary<number>;

    /**
     * The declared layout variable variations.
     */
    private _variations: BMLayoutVariableVariationMutable[];

    canUseLayoutVariables?(): boolean {
        if (this.sourceLayoutProvider) return this.sourceLayoutProvider.canUseLayoutVariables();

        return this.widget.getProperty('ExportsLayoutVariables') || (this.sourceLayoutProvider && this.sourceLayoutProvider.canUseLayoutVariables());
    }

    unavailableLayoutVariablesUserLabel?(): string {
        if (this.sourceLayoutProvider) {
            return 'The selected layout variable provider does not support layout variables.';
        }

        if (!this.widget.getProperty('ExportsLayoutVariable')) {
            if (!this.widget.getProperty('LayoutVariableProvider')) {
                return 'A layout variable provider has not been configured for this mashup and it neither exports layout variables.';
            }
        }
        return 'Layout variables available';
    }

    deserializeLayoutVariablesWithString(serializedVariables: string): void {
        const parsedVariables = <BMThingworxSerializedLayoutVariables>JSON.parse(serializedVariables);

        this._variables = parsedVariables.variables || {};
        this._variations = [];

        for (const variable in (parsedVariables.variables || {})) {
            BMView.registerLayoutVariableNamed(variable, {withValue: parsedVariables.variables[variable]});
            // Remove any previously registered variations
            BMView.removeVariationsForLayoutVariableNamed(variable);
        }

        for (const variation in (parsedVariables.variations || {})) {
            for (const variable in parsedVariables.variations[variation]) {
                if (variable == 'sizeClass') continue;
                const sizeClass: BMLayoutSizeClass = (<any>BMLayoutSizeClass)._layoutSizeClassForHashString(variation);
                BMView.setLayoutVariableValue(parsedVariables.variations[variation][variable], {named: variable, inSizeClass: sizeClass});

                this._variations.push({name: variable, value: parsedVariables.variations[variation][variable], sizeClass: sizeClass});
            }
        }
    }

    prepareLayoutVariables?(): void {
        if (this.sourceLayoutProvider) return this.sourceLayoutProvider.prepareLayoutVariables();

        this.deserializeLayoutVariablesWithString(this.widget.getProperty('_LayoutVariables') || '{"variables":{},"variations":{}}');
    }

    get layoutVariables(): Dictionary<number> {
        if (this.sourceLayoutProvider) return this.sourceLayoutProvider.layoutVariables;

        return this._variables;
    }

    variationsForLayoutVariableNamed?(named: string): BMLayoutVariableVariation[] {
        if (this.sourceLayoutProvider) return this.sourceLayoutProvider.variationsForLayoutVariableNamed(named);

        const result: BMLayoutVariableVariation[] = [];

        for (const variation of this._variations) {
            if (variation.name == named) result.push(variation);
        }

        return result;
    }
    registerLayoutVariableNamed?(named: string, { withValue: value }: { withValue: number; }): void {
        if (this.sourceLayoutProvider) return this.sourceLayoutProvider.registerLayoutVariableNamed(named, {withValue: value});

        this._variables[named] = value;

        BMView.registerLayoutVariableNamed(named, {withValue: value});
    }

    renameLayoutVariableNamed?(named: string, { toName: newName }: { toName: string; }): void {
        if (this.sourceLayoutProvider) return this.sourceLayoutProvider.renameLayoutVariableNamed(named, {toName: newName});

        if (named in this._variables) {
            if (newName in this._variables) {
                throw new Error('A layout variable with the given name already exists.');
            }

            // Update the variable
            this._variables[newName] = this._variables[named];
            delete this._variables[named];

            // And also all of its variations
            for (let key in this._variations) {
                if (named in this._variations[key]) {
                    this._variations[key][newName] = this._variations[key][named];
                    delete this._variations[key][named];
                }
            }
        }

        BMView.renameLayoutVariableNamed(named, {toName: newName});
    }

    unregisterLayoutVariableNamed?(named: string): void {
        if (this.sourceLayoutProvider) return this.sourceLayoutProvider.unregisterLayoutVariableNamed(named);

        delete this._variables[named];

        BMView.unregisterLayoutVariableNamed(named);
    }
    setLayoutVariableValue?(value: number, { named: name, inSizeClass: sizeClass }: { named: string; inSizeClass: BMLayoutSizeClass; }): void {
        if (this.sourceLayoutProvider) return this.sourceLayoutProvider.setLayoutVariableValue(value, {named: name, inSizeClass: sizeClass});

        // Check if the variation already exists
        let hasVariation = NO;
        for (const variation of this._variations) {
            if (variation.name == name && variation.sizeClass == sizeClass) {
                // If it does then update its value
                variation.value = value;
                hasVariation = YES;
                break;
            }
        }

        // If the variation doesn't already exist, register it
        if (!hasVariation) {
            this._variations.push({name, sizeClass, value});
        }

        BMView.setLayoutVariableValue(value, {named: name, inSizeClass: sizeClass});
    }

    removeVariationForLayoutVariableNamed?(name: string, { inSizeClass: sizeClass }: { inSizeClass: BMLayoutSizeClass; }): void {
        if (this.sourceLayoutProvider) return this.sourceLayoutProvider.removeVariationForLayoutVariableNamed(name, {inSizeClass: sizeClass});

        for (let i = 0; i < this._variations.length; i++) {
            const variation = this._variations[i];
            if (variation.name == name && variation.sizeClass == sizeClass) {
                this._variations.splice(i, 1);
                break;
            }
        }

        BMView.removeVariationForLayoutVariableNamed(name, {inSizeClass: sizeClass});
    }

    serializedLayoutVariables(): BMThingworxSerializedLayoutVariables {
        // Serialize and save the updated layout variables as properties
        const serializedVariables: BMThingworxSerializedLayoutVariables = {variables: {}, variations: {}};
        serializedVariables.variables = this._variables;
        
        const variations: Dictionary<Dictionary<number>> = {};

        for (const variable in this._variables) {
            const variableVariations = this.variationsForLayoutVariableNamed(variable);

            for (const variation of variableVariations) {
                const hashString = (<any>variation).sizeClass._hashString;

                variations[hashString] = variations[hashString] || {};
                variations[hashString][variable] = variation.value;
            }
        }

        serializedVariables.variations = variations;

        return serializedVariables;
    }

    persistLayoutVariables?(): void {
        if (this.sourceLayoutProvider) return this.sourceLayoutProvider.persistLayoutVariables();

        // Serialize and save the updated layout variables as properties
        const serializedVariables = this.serializedLayoutVariables();

        this.widget.setProperty('_LayoutVariables', JSON.stringify(serializedVariables));
    }

    
}

/**
 * A layout variable provider that derives its data from a mashup that is not open.
 */
export class BMThingworxRemoteLayoutVariableProvider extends BMThingworxLayoutVariableProvider {

    /**
     * The name of the mashup from which this remote layout variable provider derives its data.
     */
    mashupName?: string;

    mashupDefinition?: TWMashupEntityDefinition;

    mashupContent?: TWMashupDefinition;

    /**
     * Set to `YES` if the remote mashup is a valid layout provider.
     */
    validProvider: boolean;

    canUseLayoutVariables(): boolean {
        if (this.widget) return super.canUseLayoutVariables();

        return this.validProvider;
    }

    async prepareLayoutVariables() {
        // If the mashup for this provider is open, redirect this to the standard implementation
        if (this.widget) return super.prepareLayoutVariables();

        // Otherwise perform a request to load the variables 
        let mashupDefinitionRequest = await fetch(`/Thingworx/Mashups/${this.mashupName}`, {method: 'GET', headers: {Accept: 'application/json'}});

        let content: TWMashupEntityDefinition = JSON.parse(await mashupDefinitionRequest.text());
        this.mashupDefinition = content;

        let mashupContent: TWMashupDefinition = JSON.parse(content.mashupContent);
        this.mashupContent = mashupContent;

        // Check that the root widget is a view that exports layout variables
        let rootWidget = mashupContent.UI.Widgets[0];

        if (rootWidget.Properties.ExportsLayoutVariables) {
            this.validProvider = YES;
            this.deserializeLayoutVariablesWithString(rootWidget.Properties._LayoutVariables || '{}');
        }
        else {
            this.validProvider = NO;
        }
    }

    async persistLayoutVariables() {
        // If the mashup for this provider is open, redirect this to the standard implementation
        if (this.widget) return super.persistLayoutVariables();

        // If the provider is not valid, there is nothing to do
        if (!this.validProvider) return;

        // Otherwise update the definition and perform a PUT request to save the mashup.
        this.mashupContent!.UI.Widgets[0].Properties._LayoutVariables = JSON.stringify(this.serializedLayoutVariables());

        this.mashupDefinition.mashupContent = JSON.stringify(this.mashupContent);

        fetch(`/Thingworx/Mashups/${this.mashupName}`, {method: 'PUT', headers: {Accept: 'application/json', 'Content-Type': 'application/json'}, body: JSON.stringify(this.mashupDefinition)});
    }

}

/**
 * Composer widget view is a subclass of view with an assignable contentNode property
 * and an identifier.
 * 
 * Typically for widgets with a custom view subclass, this view type is used instead when representing
 * that widget in the composer and the custom subclass is reserved for use at runtime.
 */
class BMComposerWidgetView extends BMView {

    //@ts-ignore
    _contentNode: DOMNode;

    //@ts-ignore
    get contentNode() {
        return this._contentNode;
    }

    get ID(): string {
        return $(this.widget?.jqElement[0] || this.contentNode).data('widget').properties.Id;
    }

    /**
     * An object that acts as an interface between the layout editor settings and the widget.
     */
    _settingsController?: object;

    get settingsController(): object {
        if (this._settingsController) return this._settingsController;

        this._settingsController = {};
        return this._settingsController;
    }

    /**
     * The widget whose layout is managed by this view.
     */
    widget?: TWComposerWidget;

    // @override - BMView
    additionalSettingTabsForLayoutEditor(editor: BMLayoutEditor): BMLayoutEditorSettingsTab[] {
        const tabs: BMLayoutEditorSettingsTab[] = [];

        if (USE_WIDGET_PROPERTIES) {
            // Add a tab for the widget properties
            const propertiesIcon = require('./images/widgetPropertiesIcon.png').default;
            const propertiesTab = BMLayoutEditorSettingsTab.tabWithName('Widget Properties', {icon: propertiesIcon});
            tabs.push(propertiesTab);
        }

        return tabs;
    }

    additionalSettingSectionsForTab(tab: BMLayoutEditorSettingsTab, {layoutEditor}: {layoutEditor: BMLayoutEditor}): BMLayoutEditorSettingsSection[] {
        if (!USE_WIDGET_PROPERTIES) {
            return [];
        }

        switch (tab.name) {
            case 'Widget Properties':
                return this.widgetPropertiesSections(tab, undefined, ['Width', 'Height', 'Top', 'Left', 'Id', 'Type', 'Description', 'DisplayName']);
            case 'Attributes':
                return this.widgetPropertiesSections(tab, ['Id', 'Type', 'Description', 'DisplayName']);
        }
        

        return [];
    }

    /**
     * Returns an array of setting sections containing the widget properties to display.
     * @param include       If specified, only the properties in the given array will be included.
     * @param exclude       If specified, the properties in the given array will be excluded.
     * @returns             An array of setting sections.
     */
    widgetPropertiesSections(tab: BMLayoutEditorSettingsTab, include?: string[], exclude?: string[]): BMLayoutEditorSettingsSection[] {
        const sections: BMLayoutEditorSettingsSection[] = [];

        // Add a section for all the generic widget properties
        if (!this.widget) return sections;
        
        // TODO: Allow specifying different sections
        const propertiesSection = BMLayoutEditorSettingsSection.section();
        propertiesSection.name = 'Properties';
        propertiesSection.collapsible = YES;

        sections.push(propertiesSection);

        const settings = [];

        Object.values(this.widget.allWidgetProperties().properties).forEach(prop => {
            // Exclude events and services from here
            if (prop.type != 'property') return;

            // Exclude hidden properties
            if (prop.isVisible === false) return;

            // Exclude layout and info properties
            if (exclude?.includes(prop.name)) return;

            if (include && !include.includes(prop.name)) return;

            // Ensure that the settings controller can handle this property
            Object.defineProperty(this.settingsController, prop.name!, {
                configurable: YES,
                get: () => {
                    return this.widget.getProperty(prop.name);
                },
                set: (value) => {
                    this.widget.setProperty(prop.name, value);

                    if (this.supportsAutomaticIntrinsicSize) {
                        this.invalidateIntrinsicSize();
                    }

                    tab.updateSettings();
                }
            });

            const target = this.settingsController;

            // If the property is not editable, add it as a readonly property
            if (prop.isEditable === false) {
                const setting = BMLayoutEditorSetting.settingWithName(prop.name!, {kind: BMLayoutEditorSettingKind.Info, target, property: prop.name, nullable: YES});
                settings.push(setting);
                return;
            }

            // Create an appropriate setting based on the property type
            let setting: BMLayoutEditorSetting;
            switch (prop.baseType) {
                case 'STRING':
                    if (prop.selectOptions) {
                        setting = BMLayoutEditorEnumSetting.settingWithName(prop.name!, {kind: BMLayoutEditorSettingKind.Enum, target, property: prop.name, nullable: YES});
                        (setting as BMLayoutEditorEnumSetting).options = prop.selectOptions.map(o => {
                            const item = BMMenuItem.menuItemWithName(o.text);
                            item.userInfo = o.value;
                            return item;
                        });
                    }
                    else {
                        setting = BMLayoutEditorSetting.settingWithName(prop.name!, {kind: BMLayoutEditorSettingKind.String, target, property: prop.name, nullable: YES});
                    }
                    break;
                case 'NUMBER':
                case 'INTEGER':
                case 'LONG':
                    setting = BMLayoutEditorSetting.settingWithName(prop.name!, {kind: BMLayoutEditorSettingKind.Number, target, property: prop.name, nullable: YES});
                    break;
                case 'BOOLEAN':
                    setting = BMLayoutEditorSetting.settingWithName(prop.name!, {kind: BMLayoutEditorSettingKind.Boolean, target, property: prop.name});
                    break;
                case 'DATETIME':
                    setting = BMLayoutEditorSetting.settingWithName(prop.name!, {kind: BMLayoutEditorSettingKind.Number, target, property: prop.name, nullable: YES});
                    break;
                default:
                    setting = BMLayoutEditorSetting.settingWithName(prop.name!, {kind: BMLayoutEditorSettingKind.Info, target, property: prop.name, nullable: YES});
                    break;
            }

            settings.push(setting);
        });

        propertiesSection.settings = settings;

        return sections;
    }
}

/**
 * Returns the bounding box of the given composer widget.
 * @param widget    The widget.
 * @return          The bounding box.
 */
function BMBoundingBoxOfComposerWidget(widget: TWComposerWidget): DOMNode {
    return widget.jqElement[0].parentElement;
}

/**
 * Returns a view that will manage the given Thingworx widget.
 * The widget's sizing will be moved from its `jqElement` to its `boundingBox`.
 * @param widget            The widget.
 * @param $1               Additional arguments.
 * @param $1.recreated     Defaults to `NO`. If set to `YES`, the view will be recreated.
 * @return                  A view.
 */
function BMViewForThingworxWidget(widget: TWComposerWidget, {recreated} : {recreated?: boolean}): BMView {
    let _widget: any = widget;

    let view: BMView;
    if (_widget.coreUIView) {
        // For widgets that supply their own view, don't modify their settings
        if (recreated) {
            view = _widget.rebuiltCoreUIView;
        }
        else {
            view = _widget.coreUIView;
        }
    }
    else {
        view = BMView.viewForNode.call((_widget.coreUIViewClass || BMComposerWidgetView), BMBoundingBoxOfComposerWidget(widget));

        if ((view as any)._isStale && recreated) {
            view.release();
            view = BMView.viewForNode.call((_widget.coreUIViewClass || BMComposerWidgetView), BMBoundingBoxOfComposerWidget(widget));
        }

        (view as BMComposerWidgetView).widget = widget;

        (view as any)._isStale = YES;

        (view as any)._contentNode = widget.jqElement[0];
        view.debuggingName = widget.getProperty('DisplayName');

        /*
        Only allow intrinsic sizes for:
            * Label
            * Button
            * ValueDisplay
            * Image
        */
        switch (_widget.properties.__TypeDisplayName) {
            case 'Label':
            case 'Value Display':
            case 'Image':
            case 'Button':
            case 'ExtendedButton':
                (view as any).supportsAutomaticIntrinsicSize = YES;
                break;
            case 'Collection View':
                (view as any).supportsAutomaticIntrinsicSize = NO;
                view.didSetFrame = frame => _widget.collectionView.frame = frame;
                break;
            default:
                (view as any).supportsAutomaticIntrinsicSize = NO;
                break;
        }
        

    }

    // Copy over the sizing properties from the jqElement to the boundingBox
    if (widget.jqElement[0].style.width && widget.jqElement[0].style.width != '100%') {
        BMBoundingBoxOfComposerWidget(widget).style.width = widget.jqElement[0].style.width;
        widget.jqElement[0].style.width = '100%';
    }

    if (widget.jqElement[0].style.height && widget.jqElement[0].style.height != '100%') {
        BMBoundingBoxOfComposerWidget(widget).style.height = widget.jqElement[0].style.height;
        widget.jqElement[0].style.height = '100%';
    }

    return view;
}

TW.IDE.Dialogs.BMViewWidget = function () {
    document.body.classList.add('BMViewInvisibleDialog');

    this.renderDialogHtml = function (widget) {
        setTimeout(() => {
            // In Thingworx 9.1, the widget reference is no longer a direct reference to the live widget
            // Instead, it appears to be a model-only reference with all of the DOM references stripped
            if (widget.jqElement) {
                widget.editLayout();
            }
            else {
                // In Thingworx 9.1, a correct reference to the widget has to be obtained manually
                const widgetRef = $(document.getElementById(widget.properties.Id)).data('widget');
                widgetRef.editLayout();
            }
        }, 200);
        return '';
    }
    this.afterRender = function () {
        // Immediately close this dialog upon being opened
        $('.ui-dialog.ui-widget.ui-widget-content').css({display: 'none'});
        requestAnimationFrame(_ => {
            // In Thingworx 9.1 the way custom dialogs are created has changed and a different selector has to be used
            const cancelButton = $('.ui-dialog.ui-widget.ui-widget-content').find('button');
            if (cancelButton.length) {
                cancelButton.eq(0).click();
            }
            else {
                const cancelButton = $('.TwxMbConfigureColumnsDialog .ui-dialog .btn.btn-secondary')[0];

                if (cancelButton) {
                    cancelButton.click();
                }
            }
            document.body.classList.remove('BMViewInvisibleDialog');
        });
    }
}


/**
 * The scroll view widget is a subclass of the view widget that allows the creation of
 * constraint based scrolling containers.
 */
@TWWidgetDefinition('View')
export class BMViewWidget extends TWComposerWidget implements BMLayoutEditorDelegate {

    /**
     * Represents this widget's view class. For widgets that directly create their views,
     * this property is optional.
     */
    coreUIViewClass: typeof BMView = BMComposerWidgetView;

    
    /**
     * The view used by this widget.
     */
    _coreUIView: BMView;

    /**
     * Returns the view used by this widget.
     */
    get coreUIView(): BMView {
        let view = BMView.viewForNode.call(this.coreUIViewClass, BMBoundingBoxOfComposerWidget(this));
        this._coreUIView = view;

        if (!view.node) throw new Error('View was created without a node.');

        view._contentNode = this.jqElement[0];
        (view as any)._supportsAutomaticIntrinsicSize = NO;
        view.debuggingName = this.getProperty('DisplayName');

        return view;
    }

    /**
     * Returns a new view for this widget.
     * If this widget already had a view for it, it is released and recreated.
     */
    get rebuiltCoreUIView() {
        if (this._coreUIView) {
            this._coreUIView.release();
        }
        return this.coreUIView;
    }

    /**
     * Can be set by subviews to indicate that they are containers whose layout should be managed
     * by the root view.
     */
    isTransparentToCoreUILayout: boolean = YES;

    layoutVariableProvider: BMThingworxLayoutVariableProvider;

    widgetIconUrl(): string {
        return require('./images/icon.png').default;
    }

    widgetProperties(): TWWidgetProperties {
        require("./styles/ide.css");
        let properties: TWWidgetProperties = {
            name: 'View',
            description: 'Allows laying out widgets using constraints instead of the classic static sizing and positioning options that Thingworx offers.',
            category: ['Common'],
            supportsAutoResize: YES,
            isContainer: YES,
            isDraggable: YES,
            customEditorMenuText: 'Edit Layout',
            customEditor: 'BMViewWidget',
            properties: {
                Width: {
                    description: 'Total width of the widget',
                    baseType: 'NUMBER',
                    isVisible: YES,
                    defaultValue: 300,
                    isBindingTarget: NO
                },
                Height: {
                    description: 'Total height of the widget',
                    baseType: 'NUMBER',
                    isVisible: YES,
                    defaultValue: 200,
                    isBindingTarget: NO
                },
                BorderRadius: {
                    description: 'If set, this represents the CSS border radius that this view will use.',
                    baseType: 'STRING',
                    isVisible: YES,
                    defaultValue: '',
                    isBindingTarget: NO
                },
                BoxShadow: {
                    description: 'If set, this represents the CSS box shadow that this view will use.',
                    baseType: 'STRING',
                    isVisible: YES,
                    defaultValue: '',
                    isBindingTarget: NO
                },
                ClipsSubviews: {
                    description: 'If set, subviews will be clipped to this view\'s frame, otherwise they will be allowed to draw outside of this view.',
                    baseType: 'BOOLEAN',
                    isVisible: YES,
                    defaultValue: NO,
                    isBindingTarget: NO
                },
                Style: {
                    baseType: 'STYLEDEFINITION',
                    isBindingTarget: YES,
                    description: 'The background style to use for this view.',
                    defaultValue: 'DefaultContainerStyle'
                },
                Cursor: {
                    baseType: 'STRING',
                    description: 'The cursor to use for this view.',
                    selectOptions: [
                        {text: 'Auto', value: 'auto'},
                        {text: 'Arrow', value: 'arrow'},
                        {text: 'Hand', value: 'hand'},
                        {text: 'Vertical Resize', value: 'ns-resize'},
                        {text: 'Horizontal Resize', value: 'ew-resize'},
                        {text: 'Vertical Split', value: 'row-resize'},
                        {text: 'Horizontal Split', value: 'col-resize'},
                        {text: 'Move', value: 'move'}
                    ],
                    defaultValue: 'auto'
                },
                RightToLeftLayout: {
                    baseType: 'BOOLEAN',
                    isBindingTarget: YES,
                    description: 'Should be enabled to cause the environment to switch to a right-to-left layout.',
                    defaultValue: NO
                },
                LayoutVariableProvider: {
                    baseType: 'MASHUPNAME',
                    description: 'Represents the mashup from which this layout derives its layout variables. If left blank, this layout will not be able to use layout variables. If set, this must be a mashup whose root widget is a view that has the ExportsLayoutVariables property enabled.'
                },
                ExportsLayoutVariables: {
                    baseType: 'BOOLEAN',
                    defaultValue: NO,
                    description: 'When enabled, this mashup becomes a layout variable provider for other mashups in this project.'
                },
                // The constraints represent the internal storage of the view constraints
                _Constraints: {
                    baseType: 'STRING',
                    isVisible: NO
                },
                // The intrinsic size resistances represent the internal storage of the view expansion and compression resistances
                _IntrinsicSizeResistances: {
                    baseType: 'STRING',
                    isVisible: NO
                },
                // The bindable constraints represent the constraint that have been marked bindable
                _BindableConstraints: {
                    baseType: 'STRING',
                    isVisible: NO
                },
                // Contains the layout variables for views that export them
                _LayoutVariables: {
                    baseType: 'STRING',
                    isVisible: NO
                }
            }
        };

        if (EXTENSION_MODE) {
            (<any>properties).isVisible = NO;
        }

        return properties;
    };

    // @override - BMViewWidget
    afterSetProperty(name: string, value: any): boolean {
        if (name == 'BoxShadow') {
            this._coreUIView.node.style.boxShadow = value;
        }
        else if (name == 'BorderRadius') {
            this._coreUIView.node.style.borderRadius = value;
        }
        else if (name == 'ClipsSubviews') {
            this._coreUIView.node.style.overflow = (value ? 'hidden' : 'visible');
        }
        else if (name == 'Style') {
            let style = TW.getStyleFromStyleDefinition(value);

            if (style.backgroundColor) {
                this._coreUIView.node.style.backgroundColor = style.backgroundColor;
            }
            else {
                this._coreUIView.node.style.backgroundColor = 'transparent';
            }
        }
        else if (name == 'ExportsLayoutVariables') {

        }
        else if (name == 'LayoutVariableProvider') {

        }
        return NO;
    }


	/**
	 * Invoked by the runtime immediately after this widget was placed in a mashup.
	 */
	afterLoad() {
		var properties = this.allWidgetProperties().properties;
			
		// Retrieve the bindable constraints and generate the properties for the constants
		var bindableConstraints = JSON.parse(this.getProperty('_BindableConstraints') || '[]');
			
		// Append the properties to this widget
		for (var i = 0; i < bindableConstraints.length; i++) {
            var property = bindableConstraints[i];
            var constraint = this.coreUIView.constraintWithIdentifier(property);

            // If the constraint cannot be found, ignore it
            if (!constraint) continue;

            properties[constraint.identifier] = <any>{
                isBindingTarget: YES, 
                isBaseProperty: NO,
                baseType: 'NUMBER',
                isVisible: YES,
                name: constraint ? constraint.identifier : property,
                type: 'property',
                displayName: constraint ? constraint.toString() : property,
                description: `Constant for the ${constraint.toString()} constraint.`
            };

            for (let variation in (<any>constraint)._variations) {
                if ('constant' in (<any>constraint)._variations[variation]) properties[constraint.identifier + '[' + variation + ']'] = <any>{
                    isBindingTarget: YES, 
                    isBaseProperty: NO,
                    baseType: 'NUMBER',
                    isVisible: YES,
                    name: constraint ? constraint.identifier + '[' + variation + ']' : property,
                    type: 'property',
                    displayName: constraint ? constraint.toString() : property,
                    description: `Constant for the ${constraint.toString()} constraint, in the ${'[' + variation + ']'} size class.`
                }
            }
		}
		
		// Update the properties UI
		(<any>this).updatedProperties();
	}


    refreshBindableConstraintsWithIdentifiers(identifiers: Set<string>) {
        var properties = this.allWidgetProperties().properties;
        
        // Delete the previous properties from the previous binding
        var oldBindableConstraints = JSON.parse(this.getProperty('_BindableConstraints') || '[]');
        
        for (var i = 0; i < oldBindableConstraints.length; i++) {
            delete properties[oldBindableConstraints[i]];
        }
        
        var bindableConstraints = Array.from(identifiers);
        this.setProperty('_BindableConstraints', JSON.stringify(bindableConstraints));

		// Append the properties to this widget
		for (var i = 0; i < bindableConstraints.length; i++) {
            var property = bindableConstraints[i];
            var constraint = this.coreUIView.constraintWithIdentifier(property);

            // If the bindable constraint no longer exists, ignore it
            if (!constraint) continue;

            properties[constraint.identifier] = <any>{
                isBindingTarget: YES, 
                isBaseProperty: NO,
                baseType: 'NUMBER',
                isVisible: YES,
                name: constraint ? constraint.toString() : property,
                displayName: constraint ? constraint.toString() : property,
                type: 'property',
                description: `Constant for the ${constraint.toString()} constraint.`
            };

            for (let variation in (<any>constraint)._variations) {
                if ('constant' in (<any>constraint)._variations[variation]) properties[constraint.identifier + '[' + variation + ']'] = <any>{
                    isBindingTarget: YES, 
                    isBaseProperty: NO,
                    baseType: 'NUMBER',
                    isVisible: YES,
                    name: constraint ? constraint.identifier + '[' + variation + ']' : property,
                    type: 'property',
                    displayName: constraint ? constraint.toString() : property,
                    description: `Constant for the ${constraint.toString()} constraint, in the ${'[' + variation + ']'} size class.`
                }
            }
		}
    
        // Update the properties UI
        (<any>this).updatedProperties();
    }


    /**
     * Returns the root of the view hierarchy to which this widget view belongs.
     * The root of the view hierarchy must be able to hold and generate the constraints for the entire hirerachy.
     */
    get viewHierarchyRootWidget(): TWComposerWidget {
        let rootWidget: any = this;

        while (rootWidget.parentWidget.isTransparentToCoreUILayout) {
            rootWidget = rootWidget.parentWidget;
        }

        return rootWidget;
    }

    /**
     * Returns the local view hierarchy for this view.
     * This should appropriately set up the subviews for all of the widgets
     * contained by this widget.
     * @return          The view hierarchy.
     */
    get localViewHierarchy(): BMView {
        let view = this.rebuiltCoreUIView || BMViewForThingworxWidget(this, {recreated: YES});
        // The subviews array has to be recreated because Thingworx often clears and re-creates
        // the DOM nodes associated with widgets, while their views continue to exist in the subviews array.
        //(view as any)._subviews = [];

        // Recursively get widgets for each superview
        (<TWComposerWidget[]>(<any>this).widgets).forEach(widget => {
            let subview = (widget as any).localViewHierarchy || BMViewForThingworxWidget(widget, {recreated: YES});
            //(subview as any)._superview = undefined;
            view.addSubview(subview);
        });

        return view;
    }

    /**
     * Set to YES after this view and its constraints are first initialized.
     */
    initializedConstraints: boolean = NO;

    /**
     * Returns the view for the given widget ID.
     * @param ID    The ID.
     * @return      The view.
     */
    viewForID(ID: string): BMView {
        if (!ID) return undefined;
        let element;
        if (ID == (this as any).properties.Id) {
            element = this.jqElement[0].parentElement;
        }
        else {
            let isScrollViewContentView = NO;
            if (ID.indexOf('-content-view') != -1) {
                isScrollViewContentView = YES;
                ID = ID.substring(0, ID.length - '-content-view'.length);
            }

            let nodes = this.jqElement[0].querySelectorAll('#' + ID);
            if (!nodes.length) return undefined;
            if (nodes[0].id.indexOf('-bounding-box') != -1 || isScrollViewContentView) {
                return BMView.viewForNode(nodes[0] as HTMLElement);
            }
            else {
                element = nodes[0].parentElement;
            }
        }

        let view = BMView.viewForNode.call(BMComposerWidgetView, element);

        if (view.node == view.contentNode) {
            view.contentNode = element;
        }

        if (!view.node) throw new Error('Returned stale view in viewForID(_)');

        return view;
    }

    /**
     * Contains an array of the currently active constraints.
     */
    activeConstraints: any[] = [];

    /**
     * Creates the constraints from this view's constraints definition property.
     * @return <BMView>         The local view hierarchy.
     */
    initializeConstraints(): BMView {
        return this.initializeConstraintsWithPrefix('');
    }


    /**
     * Creates the constraints from this view's constraints definition property.
     * @param prefix <String>       A prefix used to resolve widget IDs.
     * @return <BMView>             The local view hierarchy.
     */
    initializeConstraintsWithPrefix(prefix: string): BMView {
        this.initializedConstraints = YES;

        // Initialize the local view hierarchy, to ensure that the constraints can be activated
        let localViewHierarchy = this.localViewHierarchy;

        /*
        // Because composer often deletes and recreates DOM nodes when certain properties are changed,
        // the constraints actually have to be recreated whenever needed
        let constraintSet = new Set;
        // The constraints don't have to be removed because the view hierarchy is completely recreated
        this.activeConstraints.slice().forEach(constraint => constraintSet.add(constraint));
        constraintSet.forEach(constraint => constraint.remove());
        */

        this.activeConstraints = [];

        let constraintsArray: any[] = JSON.parse(this.getProperty('_Constraints') || '[]');

        // The serialized constraints have the same properties as a BMLayoutConstraint, except that
        // the views are stored as IDs from which the view references are then retrieved
        constraintsArray.forEach(constraintDefinition => {
            // Some really old versions of view had a different serialization format
            if ('_sourceViewID' in constraintDefinition) {
                constraintDefinition._sourceView = constraintDefinition._sourceViewID;
                constraintDefinition._targetView = constraintDefinition._targetViewID;

                if (constraintDefinition._sourceViewAttribute === BMLayoutAttribute.AspectRatio) {
                    constraintDefinition._kind = BMLayoutConstraintKind.AspectRatio;
                }
                else if (constraintDefinition._sourceViewAttribute === BMLayoutAttribute.Top || constraintDefinition._sourceViewAttribute == BMLayoutAttribute.Bottom || constraintDefinition._sourceViewAttribute === BMLayoutAttribute.Height || constraintDefinition._sourceViewAttribute === BMLayoutAttribute.CenterY) {
                    constraintDefinition._kind = BMLayoutConstraintKind.Vertical;
                }
                else {
                    constraintDefinition._kind = BMLayoutConstraintKind.Horizontal;
                }

            }
            let constraint = BMLayoutConstraint.constraintWithSerializedConstraint(constraintDefinition, {viewIDs: ID => this.viewForID(prefix + ID)});
            // Skip constraints that are no longer valid e.g. if their widget is removed
            if (!constraint) return;
            // The active state is now handled by the serialization process
            //constraint.isActive = YES;

            this.activeConstraints.push(constraint);
        });

        // Initialize the intrinsic size resistances as well
        let intrinsicSizeResistances = JSON.parse(this.getProperty('_IntrinsicSizeResistances') || '{}');
        Object.keys(intrinsicSizeResistances).forEach(ID => {
            let view = this.viewForID(prefix + ID);
            // Skip views that are no longer valid e.g. if their widget is removed
            if (!view) return;

            let anyView = view as any;
            view.compressionResistance = intrinsicSizeResistances[ID].compressionResistance;
            view.expansionResistance = intrinsicSizeResistances[ID].expansionResistance;
            view.opacity = ('opacity' in intrinsicSizeResistances[ID] ? intrinsicSizeResistances[ID].opacity : 1);
            anyView.isVisible = ('isVisible' in intrinsicSizeResistances[ID] ? intrinsicSizeResistances[ID].isVisible : YES);
            anyView.CSSClass = ('CSSClass' in intrinsicSizeResistances[ID] ? intrinsicSizeResistances[ID].CSSClass : '');
            anyView._serializedVariations = ('variations' in intrinsicSizeResistances[ID] ? intrinsicSizeResistances[ID].variations : {});
        });

        return localViewHierarchy;
    }

    /**
     * Set to YES while the layout is being edited.
     */
    isEditingLayout: boolean = NO;

    /**
     * Should be invoked to edit the layout managed by the root view.
     */
    editLayout(): void {
        if (this != this.viewHierarchyRootWidget) return (this.viewHierarchyRootWidget as BMViewWidget).editLayout();

        // The constraints have to be regenerated each time, because thingworx often deletes and re-creates the widget DOM nodes.
        let localViewHierarchy = this.initializeConstraints();

        // Perform layout now to initialize the reference frames for the subviews
        this._coreUIView.layout();
        let returnNode = localViewHierarchy.node.parentNode as DOMNode;

        if (EXTENSION_MODE) {
            return alert('Layout editor is not available in this version of View.');
        }
        else {
            let layoutEditor = (new BMThingworxLayoutEditor).initWithView(localViewHierarchy, {layoutVariableProvider: this.layoutVariableProvider}) as BMThingworxLayoutEditor;

            JSON.parse(this.getProperty('_BindableConstraints') || '[]').forEach(identifier => layoutEditor.bindableConstraints.add(identifier));
    
            let anyLayoutEditor = layoutEditor as any;
            anyLayoutEditor._returnNode = returnNode;
            layoutEditor.bringToFrontAnimated(YES, {fromNode: returnNode});
    
            layoutEditor.delegate = this;
    
            this.isEditingLayout = YES;
        }
    }

    layoutEditorAdditionalSettingSectionsForTab(layoutEditor: BMThingworxLayoutEditor, tab: BMLayoutEditorSettingsTab): BMLayoutEditorSettingsSection[] {
        const result = [];

        if (tab.constraint && tab.name == 'Attributes') {
            const thingworxSection = BMLayoutEditorSettingsSection.section();

            const settingHandler = {
                get identifier(): string {
                    return tab.constraint.identifier;
                },
                set identifier(value: string) {
                    if (layoutEditor.view.constraintWithIdentifier(value)) return;

                    if (layoutEditor.bindableConstraints.has(tab.constraint.identifier)) {
                        layoutEditor.bindableConstraints.delete(tab.constraint.identifier);
                        layoutEditor.bindableConstraints.add(value);
                    }
                    tab.constraint.identifier = value;
                },

                get bindable(): boolean {
                    return layoutEditor.bindableConstraints.has(tab.constraint.identifier);
                },
                set bindable(value: boolean) {
                    if (value) {
                        layoutEditor.bindableConstraints.add(tab.constraint.identifier);
                    }
                    else {
                        layoutEditor.bindableConstraints.delete(tab.constraint.identifier);
                    }
                }
            };

            const identifierSetting = BMLayoutEditorSetting.settingWithName('Identifier', {kind: BMLayoutEditorSettingKind.String, target: settingHandler, property: 'identifier'});
            const bindableSetting = BMLayoutEditorSetting.settingWithName('Bindable', {kind: BMLayoutEditorSettingKind.Boolean, target: settingHandler, property: 'bindable'});

            thingworxSection.settings = [identifierSetting, bindableSetting];
            result.push(thingworxSection);
        }
        

        return result;
    }

    /**
     * Invoked when the layout editor is about to close.
     * Causes this view to serialize and store all of the constraints that were defined.
     */
    windowWillClose(closedWindow: BMThingworxLayoutEditor): void {
        let constraints = [];

        // Save the constraints
        let constraintSet: Set<BMLayoutConstraint> = new Set;
        (<any>this._coreUIView).allConstraints.forEach(constraint => constraintSet.add(constraint));
        constraintSet.forEach(constraint => {
            let serializedConstraint = constraint.serializedConstraintWithViewIDs((view: any) => {
                let ID = view.ID;
                if (!ID) {
                    ID = view._ID;
                }
                return ID;
            });
            constraints.push(serializedConstraint);
        });

        this.setProperty('_Constraints', JSON.stringify(constraints));

        // And the intrinsic size rezistances
        let intrinsicSizeResistances = {};
        this._coreUIView.allSubviews.forEach(subview => {

            let anyView = subview as any;
            let ID = anyView.ID;
            if (!ID) {
                ID = anyView._ID;
            }

            if (ID) intrinsicSizeResistances[ID] = {
                compressionResistance: subview.compressionResistance,
                expansionResistance: subview.expansionResistance,
                opacity: subview.opacity,
                isVisible: anyView.isVisible,
                CSSClass: anyView.CSSClass,
                variations: anyView._serializedVariations
            };
        });
        this.setProperty('_IntrinsicSizeResistances', JSON.stringify(intrinsicSizeResistances));

        // Update the bindable constraints
        this.refreshBindableConstraintsWithIdentifiers(closedWindow.bindableConstraints)

        this.isEditingLayout = NO;

    }

    DOMNodeForDismissedWindow(closedWindow: any): DOMNode {
        return closedWindow._returnNode;
    }

    ideResized() {
        // While the layout is being edited, the layout editor handles resize events on its own
        if (this != this.viewHierarchyRootWidget || this.isEditingLayout) return;

        this.initializeConstraints();

        let identifiers: Set<string>;
        try {
            let bindableConstraints: string[] = JSON.parse(this.getProperty('_BindableConstraints') || '[]');
            identifiers = new Set(bindableConstraints);
        }
        catch (e) {

        }

        if (identifiers) this.refreshBindableConstraintsWithIdentifiers(identifiers);
    }

    windowDidAppear(): void {
        document.body.classList.add('BMViewEditorOpen');
    }

    /**
     * Invoked when the layout editor was closed. Removes its elements from the document.
     */
    windowDidClose(closedWindow: any): void {
        closedWindow.release();
    }

    /*widgetContextMenuItems(): any {
        return [{cmd: 'edit', menuText: 'Configure Layout', icon: '', additionalData: ''}];
    }

    widgetContextMenuCmd(cmd: any, additionalData: any): void {
        this.editLayout();
    }*/

    widgetServices(): Dictionary<TWWidgetService> {
        return {};
    };

    widgetEvents(): Dictionary<TWWidgetEvent> {
        return {};
    }

    renderHtml(): string {
        return '<div class="widget-content BMView"></div>';
    };

    async afterRender(): Promise<void> {
        let view = this.coreUIView;
        view.node.style.borderRadius = this.getProperty('BorderRadius') || '';
        view.node.style.boxShadow = this.getProperty('BoxShadow') || '';
        view.node.style.overflow = (this.getProperty('ClipsSubviews') ? 'hidden' : 'visible');
        this.afterSetProperty('Style', this.getProperty('Style'));

        // If this is a non-root view, hide layout variable related options; this view will also not have an associated layout variable provider
        // This widget will not have had its parent widget reference set up initially, so a small delay is neede
        await 0;
        if ((<any>this).parentWidget.jqElementId != 'mashup-root') {
            this.allWidgetProperties().properties.LayoutVariableProvider.isVisible = NO;
            this.allWidgetProperties().properties.ExportsLayoutVariables.isVisible = NO;
            this.updateProperties({updateUi: YES});
        }
        else {
            // TODO test with new composer
            const mashupName: string = 'CurrentTab' in TW.IDE ? TW.IDE.CurrentTab.entityName : TW.IDE.Workspace.entityModel.name;
            if (this.getProperty('ExportsLayoutVariables')) {

                // Initialize this widget's layout variable provider
                if (window._BMLayoutVariableProviders[mashupName]) {
                    window._BMLayoutVariableProviders[mashupName].widget = this;
                }
                else {
                    let provider = new BMThingworxRemoteLayoutVariableProvider();
                    provider.mashupName = mashupName;
                    provider.widget = this;
                    window._BMLayoutVariableProviders[mashupName] = provider;
                }

                this.layoutVariableProvider = window._BMLayoutVariableProviders[mashupName];
                this.layoutVariableProvider.prepareLayoutVariables();
            }
            else if (this.getProperty('LayoutVariableProvider')) {
                const mashupName = this.getProperty('LayoutVariableProvider') as string;
                this.layoutVariableProvider = new BMThingworxLayoutVariableProvider();
                this.layoutVariableProvider.widget = this;

                if (!window._BMLayoutVariableProviders[mashupName]) {
                    window._BMLayoutVariableProviders[mashupName] = new BMThingworxRemoteLayoutVariableProvider();
                    window._BMLayoutVariableProviders[mashupName].mashupName = mashupName;
                }

                this.layoutVariableProvider = window._BMLayoutVariableProviders[mashupName];
                this.layoutVariableProvider.prepareLayoutVariables();
            }
            else {
                this.layoutVariableProvider = new BMThingworxLayoutVariableProvider();
                this.layoutVariableProvider.widget = this;
            }
        }
    }

    beforeDestroy(): void {
        if (this.getProperty('ExportsLayoutVariables')) {
            this.layoutVariableProvider.widget = undefined;
        }
    }

}


/**
 * The layout guide widget is a subclass of the view widget that allows the creation of
 * views whose position can be changed by users at runtime via drag & drop.
 */
@TWWidgetDefinition('Scroll View')
export class BMScrollViewWidget extends BMViewWidget {

    isTransparentToCoreUILayout: boolean = YES;

    /**
     * Represents this widget's view class. For widgets that directly create their views,
     * this property is optional.
     */
    coreUIViewClass: typeof BMView = BMScrollView;

    
    /**
     * The view used by this widget.
     */
    //@ts-ignore
    _coreUIView: BMScrollView;

    widgetIconUrl(): string {
        return require('./images/scrollViewIcon.png').default;
    }

    widgetProperties(): TWWidgetProperties {
        let properties = super.widgetProperties();

        properties.name = 'Scroll View';
        properties.description = 'Allows laying out widgets using constraints instead of the classic static sizing and positioning options that Thingworx offers. Additionally allows constraints that are based on the scrolling position of this view.';
        properties.properties.ClipsSubviews.isEditable = NO;
        properties.properties.ClipsSubviews.defaultValue = YES;

        let additionalProperties: Dictionary<TWWidgetProperty> = {
            ScrollbarStyle: {
                baseType: 'STYLEDEFINITION',
                description: 'The style to use for the scrollbar.'
            },
            ScrollbarTrackStyle: {
                baseType: 'STYLEDEFINITION',
                description: 'Only used if you have also set a scrollbar style. The style to use for the scrollbar track.'
            },
            ScrollbarBorderRadius: {
                baseType: 'NUMBER',
                description: 'Only used if you have also set a scrollbar style. The border radius to apply to the scrollbar, in pixels.',
                defaultValue: 6,
            },
            ScrollBarTrackScrollbarWidthStyle: {
                baseType: 'NUMBER',
                description: 'Only used if you have also set a scrollbar style. The width of the scrollbar, in pixels.',
                defaultValue: 12,
            }
        };

        BMCopyProperties(properties.properties, additionalProperties);

        return properties;
    }

    /**
     * Returns the view used by this widget.
     */
    get coreUIView(): BMView {
        if (this._coreUIView) {
            return this._coreUIView;
        }

        let view = BMScrollView.scrollViewForNode(BMBoundingBoxOfComposerWidget(this), {contentNode: this.jqElement[0]});
        (view as any)._iScroll.destroy();
        (view as any)._iScroll = undefined;
        this._coreUIView = view;

        (view as any)._ID = (this as any).properties.Id;
        (view.contentView as any)._ID = (this as any).properties.Id + '-content-view';
        
        view.debuggingName = this.getProperty('DisplayName');

        return view;
    }

    /**
     * Returns a new view for this widget.
     * If this widget already had a view for it, it is released and recreated.
     */
    get rebuiltCoreUIView() {
        if (this._coreUIView) {
            this._coreUIView.release();
            this._coreUIView = undefined;
        }
        return this.coreUIView;
    }

}

/**
 * The attributed label view widget is a subclass of the view widget that allows the creation of labels
 * that contain customizable arguments that can be bound independently.
 */
@TWWidgetDefinition('Layout Guide')
export class BMLayoutGuideWidget extends BMViewWidget {

    widgetIconUrl(): string {
        return require('./images/layoutGuideIcon.png').default;
    }

    widgetProperties(): TWWidgetProperties {
        let properties = super.widgetProperties();

        properties.isContainer = NO;
        properties.name = 'Layout Guide';
        properties.description = 'Allows moving layout constraints';

        properties.properties.InitialPositionLeft = {
            baseType: 'NUMBER',
            description: 'The initial left position of this layout guide.',
            defaultValue: 0
        };

        properties.properties.InitialPositionTop = {
            baseType: 'NUMBER',
            description: 'The initial top position of this layout guide.',
            defaultValue: 0
        };

        return properties;
    }
}

/**
 * The attributed label view widget is a subclass of the view widget that allows the creation of labels
 * that contain customizable arguments that can be bound independently.
 */
@TWWidgetDefinition('Label View')
export class BMAttributedLabelViewWidget extends BMViewWidget {


    /**
     * Represents this widget's view class. For widgets that directly create their views,
     * this property is optional.
     */
    coreUIViewClass: typeof BMView = BMAttributedLabelView;

    /**
     * The view used by this widget.
     */
    //@ts-ignore
    _coreUIView: BMAttributedLabelView;

    /**
     * Returns the view used by this widget.
     */
    get coreUIView(): BMAttributedLabelView {
        if (this._coreUIView) {
            return this._coreUIView;
        }

        let view = BMAttributedLabelView.labelViewForNode(this.jqElement.parent()[0], {contentNode: this.jqElement.find('.BMAttributedLabelViewContentNode')[0], template: this.getProperty('Template')});
        this._coreUIView = view;

        this.afterSetProperty('Padding', this.getProperty('Padding') || '');
        this.afterSetProperty('Style', this.getProperty('Style'));

        for (let argument in view.arguments) {
            view.arguments[argument].value = this.getProperty(argument) || `[[${argument}]]`;
            this.afterSetProperty('Style:' + argument, this.getProperty('Style:' + argument));
            this.afterSetProperty('BorderRadius:' + argument, this.getProperty('BorderRadius:' + argument));
            this.afterSetProperty('BoxShadow:' + argument, this.getProperty('BoxShadow:' + argument));
            this.afterSetProperty('Margin:' + argument, this.getProperty('Margin:' + argument));
            this.afterSetProperty('Padding:' + argument, this.getProperty('Padding:' + argument));
        }

        (view as any)._ID = (this as any).properties.Id;
        view.debuggingName = this.getProperty('DisplayName');

        return view;
    }

    /**
     * Returns a new view for this widget.
     * If this widget already had a view for it, it is released and recreated.
     */
    get rebuiltCoreUIView() {
        if (this._coreUIView) {
            this._coreUIView.release();
            this._coreUIView = undefined;
        }
        return this.coreUIView;
    }

    widgetIconUrl(): string {
        return require('./images/labelViewIcon.png').default;
    }

    widgetProperties(): TWWidgetProperties {
        let properties = super.widgetProperties();

        properties.isContainer = NO;
        properties.name = 'Label View';
        properties.description = 'Displays a template string with bindable arguments.';
        properties.isDraggable = NO;

        properties.properties.Padding = {
            baseType: 'STRING',
            description: 'The CSS padding to use for the entire attributed label.',
            defaultValue: ''
        }

        properties.properties.Template = {
            baseType: 'STRING',
            description: 'The template of the string to display.',
            defaultValue: '',
            isBindingTarget: YES,
            isLocalizable: YES
        };

        properties.properties.DisplayedString = {
            baseType: 'STRING',
            description: 'The template string after filling in the arguments.',
            isEditable: NO,
            isBindingSource: YES
        };

        properties.properties.LineHeight = {
            baseType: 'STRING',
            description: 'The line height to use for this view.'
        }

        properties.properties._Arguments = {
            baseType: 'STRING',
            isVisible: NO
        }

        return properties;
    }

    renderHtml(): string {
        return '<div class="widget-content BMView BMAttributedLabelView"><div class="BMAttributedLabelViewContentNode"></div></div>';
    };

    async afterRender(): Promise<void> {
        return super.afterRender();
    }

    afterLoad() {
        let _arguments: string[] = JSON.parse(this.getProperty('_Arguments') || '[]');
        let properties = this.allWidgetProperties().properties;

        for (let argument of _arguments) {

            properties['Argument:' + argument] = {
                isBaseProperty: NO,
                name: 'Argument:' + argument,
                type: 'property',
                isVisible: YES,
                baseType: 'ANYSCALAR',
                isBindingTarget: YES,
                isEditable: NO,
                description: `The value of the ${argument} argument.`
            } as any;

            properties['Style:' + argument] = {
                isBaseProperty: NO,
                name: 'Style:' + argument,
                type: 'property',
                isVisible: YES,
                baseType: 'STYLEDEFINITION',
                isBindingTarget: YES,
                description: `The style to use for the ${argument} argument.`
            } as any;

            properties['State:' + argument] = {
                isBaseProperty: NO,
                name: 'State:' + argument,
                type: 'property',
                isVisible: YES,
                baseType: 'RENDERERWITHSTATE',
                baseTypeInfotableProperty: 'Argument:' + argument,
                isBindingTarget: NO,
                description: `The style to use for the ${argument} argument.`
            } as any;

            properties['StateExtendsStyle:' + argument] = {
                isBaseProperty: NO,
                name: 'StateExtendsStyle:' + argument,
                type: 'property',
                isVisible: YES,
                baseType: 'BOOLEAN',
                defaultValue: true,
                baseTypeInfotableProperty: 'Argument:' + argument,
                isBindingTarget: NO,
                description: `If enabled, the state formatting options will only override the colors of the style for the ${argument} argument.`
            } as any;

            properties['BorderRadius:' + argument] = {
                isBaseProperty: NO,
                name: 'BorderRadius:' + argument,
                type: 'property',
                isVisible: YES,
                baseType: 'STRING',
                baseTypeInfotableProperty: 'Argument:' + argument,
                isBindingTarget: NO,
                description: `The CSS border radius to use for the ${argument} argument.`
            } as any;

            properties['BoxShadow:' + argument] = {
                isBaseProperty: NO,
                name: 'BoxShadow:' + argument,
                type: 'property',
                isVisible: YES,
                baseType: 'STRING',
                baseTypeInfotableProperty: 'Argument:' + argument,
                isBindingTarget: NO,
                description: `The CSS box shadow to use for the ${argument} argument.`
            } as any;

            properties['Padding:' + argument] = {
                isBaseProperty: NO,
                name: 'Padding:' + argument,
                type: 'property',
                isVisible: YES,
                baseType: 'STRING',
                baseTypeInfotableProperty: 'Argument:' + argument,
                isBindingTarget: NO,
                description: `The CSS padding to use for the ${argument} argument.`
            } as any;

            properties['Margin:' + argument] = {
                isBaseProperty: NO,
                name: 'Margin:' + argument,
                type: 'property',
                isVisible: YES,
                baseType: 'STRING',
                baseTypeInfotableProperty: 'Argument:' + argument,
                isBindingTarget: NO,
                description: `The CSS margin to use for the ${argument} argument.`
            } as any;
        }
    }

    afterSetProperty(name: string, value: any): boolean {
        if (name == 'Padding') {
            this.coreUIView.contentNode.style.padding = value;
        }

        if (name == 'Template') {
            let properties = this.allWidgetProperties().properties;

            let oldArguments = this.coreUIView.arguments;

            value = TW.IDE.convertLocalizableString(value);
            this.coreUIView.template = value;

            // Remove the previous definitions of the properties
            for (let argument in oldArguments) {
                if (!(argument in this.coreUIView.arguments)) continue;
                delete properties['Argument:' + argument];
                delete properties['Style:' + argument];
                delete properties['State:' + argument];
                delete properties['StateExtendsStyle:' + argument];
                delete properties['BorderRadius:' + argument];
                delete properties['BoxShadow:' + argument];
            }

            let _arguments: string[] = [];

            // Then create new definitions for the arguments
            for (let argument in this.coreUIView.arguments) {
                this.coreUIView.arguments[argument].value = this.getProperty(argument) || `[[${argument}]]`;
                _arguments.push(argument);

                if (argument in properties) continue;

                properties['Argument:' + argument] = {
                    isBaseProperty: NO,
                    name: 'Argument:' + argument,
                    type: 'property',
                    isVisible: YES,
                    baseType: 'ANYSCALAR',
                    isBindingTarget: YES,
                    description: `The value of the ${argument} argument.`
                } as any;

                properties['Style:' + argument] = {
                    isBaseProperty: NO,
                    name: 'Style:' + argument,
                    type: 'property',
                    isVisible: YES,
                    baseType: 'STYLEDEFINITION',
                    isBindingTarget: YES,
                    description: `The style to use for the ${argument} argument.`
                } as any;

                properties['State:' + argument] = {
                    isBaseProperty: NO,
                    name: 'State:' + argument,
                    type: 'property',
                    isVisible: YES,
                    baseType: 'RENDERERWITHSTATE',
                    baseTypeInfotableProperty: 'Argument:' + argument,
                    isBindingTarget: NO,
                    description: `The style to use for the ${argument} argument.`
                } as any;

                properties['StateExtendsStyle:' + argument] = {
                    isBaseProperty: NO,
                    name: 'StateExtendsStyle:' + argument,
                    type: 'property',
                    isVisible: YES,
                    baseType: 'BOOLEAN',
                    defaultValue: NO,
                    baseTypeInfotableProperty: 'Argument:' + argument,
                    isBindingTarget: NO,
                    description: `If enabled, the state formatting options will only override the colors of the style for the ${argument} argument.`
                } as any;

                properties['BorderRadius:' + argument] = {
                    isBaseProperty: NO,
                    name: 'BorderRadius:' + argument,
                    type: 'property',
                    isVisible: YES,
                    baseType: 'STRING',
                    baseTypeInfotableProperty: 'Argument:' + argument,
                    isBindingTarget: NO,
                    description: `The CSS border radius to use for the ${argument} argument.`
                } as any;
    
                properties['BoxShadow:' + argument] = {
                    isBaseProperty: NO,
                    name: 'BoxShadow:' + argument,
                    type: 'property',
                    isVisible: YES,
                    baseType: 'STRING',
                    baseTypeInfotableProperty: 'Argument:' + argument,
                    isBindingTarget: NO,
                    description: `The CSS box shadow to use for the ${argument} argument.`
                } as any;

                properties['Padding:' + argument] = {
                    isBaseProperty: NO,
                    name: 'Padding:' + argument,
                    type: 'property',
                    isVisible: YES,
                    baseType: 'STRING',
                    baseTypeInfotableProperty: 'Argument:' + argument,
                    isBindingTarget: NO,
                    description: `The CSS padding to use for the ${argument} argument.`
                } as any;
    
                properties['Margin:' + argument] = {
                    isBaseProperty: NO,
                    name: 'Margin:' + argument,
                    type: 'property',
                    isVisible: YES,
                    baseType: 'STRING',
                    baseTypeInfotableProperty: 'Argument:' + argument,
                    isBindingTarget: NO,
                    description: `The CSS margin to use for the ${argument} argument.`
                } as any;
            }

            this.setProperty('_Arguments', JSON.stringify(_arguments));

            // Let the platform know that the properties were updated
            (<any>this).updatedProperties();
        }

        if (name == 'Style') {
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

        if (name.startsWith('Argument:')) {
            let argument = name.substring(9);

            if (argument in this.coreUIView.arguments) {
                this.coreUIView.arguments[argument].value = value;
            }
        }

        if (name.startsWith('Style:')) {
            let argument = name.substring(6);

            if (argument in this.coreUIView.arguments) {
                // TODO
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

        if (name.startsWith('State:')) {
            this.rebuiltCoreUIView;
        }

        return super.afterSetProperty(name, value);
    }

}

/**
 * The text field widget is a subclass of the view widget that allows the creation of text fields that support
 * automatic completion and suggestions.
 */
@TWWidgetDefinition('Text Field')
export class BMTextFieldWidget extends BMViewWidget {

    renderHtml(): string {
        return '<input type="text" class="widget-content BMView"></input>';
    }

    widgetProperties(): TWWidgetProperties {
        const properties = super.widgetProperties();

        properties.isContainer = NO;
        properties.name = 'Text Field';
        properties.description = 'A text field that supports suggestions and automatic completion';

        properties.properties.Cursor.isVisible = NO;

        const widgetProperties = BMCopyProperties({
            Value: {
                baseType: 'STRING',
                description: 'The text within this text field.',
                isBindingTarget: YES,
                isBindingSource: YES
            },
            Suggestions: {
                baseType: 'INFOTABLE',
                description: 'An optional list of suggestions to use for autocompletion.',
                isBindingTarget: YES
            },
            SuggestionField: {
                baseType: 'FIELDNAME',
                sourcePropertyName: 'Suggestions',
                description: 'When suggestions are used, this represents the infotable field containing the suggestions.'
            },
            ShowsSuggestionsDropdown: {
                baseType: 'BOOLEAN',
                defaultValue: YES,
                description: 'When enabled, the suggestions will be displayed in a drop down menu while the text field is focused.'
            },
            AutoCompletes: {
                baseType: 'BOOLEAN',
                defaultValue: YES,
                description: 'When enabled, the closest suggestion will be automatically completed while the user types in the text field.'
            },
            SelectsSuggestion: {
                baseType: 'BOOLEAN',
                defaultValue: NO,
                description: 'When enabled, whenever this text field\'s value matches a suggestion, the row containing that suggestion will be selected.'
            }
        } as Dictionary<TWWidgetProperty>, 
        properties.properties);

        properties.properties = widgetProperties;

        return properties;
    }

    widgetEvents(): Dictionary<TWWidgetEvent> {
        return {
            ReturnPressed: {description: 'Triggered upon the user pressing the return key.'},
            ContentsDidChange: {description: 'Triggered whenever the contents in this text field change for any reason. This will be repeatedly triggered while the user is typing.'},
            TextFieldDidAcquireFocus: {description: 'Triggered whenever this text field acquires keyboard focus.'},
            TextFieldDidResignFocus: {description: 'Triggered whenever this text field loses keyboard focus.'}
        }
    }

}


TW.IDE.Dialogs.BMKeyboardShortcutController = function () {
    document.body.classList.add('BMViewInvisibleDialog');

    this.renderDialogHtml = function (widget) {
        setTimeout(() => {
            // In Thingworx 9.1, the widget reference is no longer a direct reference to the live widget
            // Instead, it appears to be a model-only reference with all of the DOM references stripped
            if (widget.jqElement) {
                widget.configureKeyboardShortcuts();
            }
            else {
                // In Thingworx 9.1, a correct reference to the widget has to be obtained manually
                const widgetRef = $(document.getElementById(widget.properties.Id)).data('widget');
                widgetRef.configureKeyboardShortcuts();
            }
        }, 200);
        return '';
    }
    this.afterRender = function () {
        // Immediately close this dialog upon being opened
        $('.ui-dialog.ui-widget.ui-widget-content').css({display: 'none'});
        requestAnimationFrame(_ => {
            // In Thingworx 9.1 the way custom dialogs are created has changed and a different selector has to be used
            const cancelButton = $('.ui-dialog.ui-widget.ui-widget-content').find('button');
            if (cancelButton.length) {
                cancelButton.eq(0).click();
            }
            else {
                const cancelButton = $('.TwxMbConfigureColumnsDialog .ui-dialog .btn.btn-secondary')[0];

                if (cancelButton) {
                    cancelButton.click();
                }
            }
            document.body.classList.remove('BMViewInvisibleDialog');
        });
    }
}

/**
 * A dictionary that contains the mapping between key codes and the character
 * symbols that represent them.
 */
const BMKeyboardShortcutCharacterMap: Dictionary<string> = {
    Backquote: '`',
    Minus: '-',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Semicolon: ';',
    Quote: '\'',
    Comma: ',',
    Period: '.',
    Slash: '/',
    Enter: BMHTMLEntity.Return as string,
    Escape: BMHTMLEntity.Escape as string,
    Backspace: BMHTMLEntity.Delete as string,
    // These modifier keys shouldn't appear as actual shortcut keys
    MetaLeft: ' ',
    MetaRight: ' ',
    ControlLeft: ' ',
    ControlRight: ' ',
    AltLeft: ' ',
    AltRight: ' ',
    ShiftLeft: ' ',
    ShiftRight: ' '
};

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
 * A cell that displays a keyboard shortcut.
 */
class BMKeyboardShortcutCell extends BMCollectionViewCell {

    private _keyboardShortcut: BMNamedKeyboardShortcut;

    /**
     * The keyboard shortcut displayed by this cell.
     */
    get keyboardShortcut(): BMNamedKeyboardShortcut {
        return this._keyboardShortcut;
    }
    set keyboardShortcut(shortcut: BMNamedKeyboardShortcut) {
        if (shortcut == this._keyboardShortcut) return;

        this._keyboardShortcut = shortcut;
        this._shortcutView.node.innerHTML = this._keyboardShortcutRepresentation;
        this._preventsDefaultCheckbox.checked = shortcut.preventsDefault;
        this._nameField.value = shortcut.name || '';
    }

    /**
     * The configuration window managing keyboard shortcuts.
     */
    configurationWindow: BMKeyboardShortcutConfigurationWindow;

    /**
     * The view to which this cell's content is added.
     */
    contentView: BMView;

    /**
     * The view that displays and captures keyboard shortcuts.
     */
    private _shortcutView: BMView;

    /**
     * The input element that displays and controls the prevents default setting.
     */
    private _preventsDefaultCheckbox: HTMLInputElement;

    /**
     * The input element that displays and controls the shortcut's name.
     */
    private _nameField: HTMLInputElement;

    initWithCollectionView(collectionView, args): BMKeyboardShortcutCell {
        super.initWithCollectionView(collectionView, args);

        // Set up the content view
        this.contentView = BMView.view();
        this.addSubview(this.contentView);
        this.contentView.leading.equalTo(this.leading).isActive = YES;
        this.contentView.trailing.equalTo(this.trailing).isActive = YES;
        this.contentView.top.equalTo(this.top).isActive = YES;
        this.contentView.bottom.equalTo(this.bottom).isActive = YES;

        // Set up the name box
        this._nameField = document.createElement('input');
        this._nameField.type = 'text';
        this._nameField.placeholder = 'New Shortcut';
        this._nameField.classList.add('BMInput', 'BMLabel');
        const nameView = BMView.viewForNode(this._nameField);
        this.contentView.addSubview(nameView);
        nameView.leading.equalTo(this.contentView.leading, {plus: 32}).isActive = YES;
        nameView.width.equalTo(200 as any).isActive = YES;
        nameView.centerY.equalTo(this.contentView.centerY).isActive = YES;
        nameView.height.equalTo(32 as any).isActive = YES;
        this._nameField.addEventListener('change', e => this._keyboardShortcut.name = this._nameField.value.replace(/\s+/g, ''));

        // Set up the shortcut view that displays and captures keyboard shortcuts
        const shortcutView = BMView.view();
        shortcutView.node.classList.add('BMLabel', 'BMKeyboardShortcutView', 'BMCollectionViewCellEventHandler');
        this.contentView.addSubview(shortcutView);
        shortcutView.leading.equalTo(nameView.trailing, {plus: 16}).isActive = YES;
        shortcutView.width.equalTo(128 as any).isActive = YES;
        shortcutView.centerY.equalTo(this.contentView.centerY).isActive = YES;
        shortcutView.height.equalTo(32 as any).isActive = YES;

        shortcutView.node.tabIndex = -1;
        shortcutView.node.addEventListener('keydown', event => this.shortcutKeyPressedWithEvent(event));

        this._shortcutView = shortcutView;

        // Set up the prevents default toggle and label
        const preventsDefaultLabel = BMView.view();
        preventsDefaultLabel.node.classList.add('BMLabel', 'BMSublabel');
        preventsDefaultLabel.node.innerText = 'Prevents default: ';
        this.contentView.addSubview(preventsDefaultLabel);
        preventsDefaultLabel.supportsAutomaticIntrinsicSize = YES;
        preventsDefaultLabel.centerY.equalTo(shortcutView.centerY).isActive = YES;

        const preventsDefaultToggle = BMView.view();
        this.contentView.addSubview(preventsDefaultToggle);
        preventsDefaultToggle.leading.equalTo(preventsDefaultLabel.trailing, {plus: 8}).isActive = YES;
        preventsDefaultToggle.centerY.equalTo(shortcutView.centerY).isActive = YES;
        preventsDefaultToggle.width.equalTo(128 as any).isActive = YES;
        preventsDefaultToggle.height.equalTo(24 as any).isActive = YES;

        // Create the toggle
        let value = document.createElement('label');
        value.className = 'BMWindowSwitch';
        value.style.margin = '0';
        
        value.innerHTML = `<input type="checkbox" data-toggle="YES"> OFF
        <div class="BMWindowSwitchGutter">
            <div class="BMWindowSwitchKnob"></div>
        </div>
        ON`;

        const switchView = BMView.viewForNode(value);
        preventsDefaultToggle.addSubview(switchView);
        switchView.supportsAutomaticIntrinsicSize = YES;
        switchView.debuggingName = 'BooleanSwitch';

        switchView.centerY.equalTo(preventsDefaultToggle.centerY).isActive = YES;
        switchView.leading.equalTo(preventsDefaultToggle.leading).isActive = YES;
        switchView.width.equalTo(104 as any).isActive = YES;
        switchView.height.equalTo(20 as any).isActive = YES;

        this._preventsDefaultCheckbox = value.getElementsByTagName('input')[0];
        this._preventsDefaultCheckbox.addEventListener('change', e => {
            this._keyboardShortcut.preventsDefault = this._preventsDefaultCheckbox.checked;
        });

        // Create the delete button
        const deleteButton = BMView.view();
        deleteButton.node.classList.add('BMButton', 'BMButtonWeak');
        deleteButton.node.innerText = '×';
        deleteButton.supportsAutomaticIntrinsicSize = YES;
        this.contentView.addSubview(deleteButton);
        deleteButton.centerY.equalTo(this.contentView.centerY).isActive = YES;
        deleteButton.trailing.equalTo(this.contentView.trailing, {plus: -32}).isActive = YES;
        deleteButton.leading.equalTo(preventsDefaultToggle.trailing, {plus: 16}).isActive = YES;

        deleteButton.node.addEventListener('click', e => this.configurationWindow.removeShortcut(this._keyboardShortcut));

        return this;
    }

    /**
     * Returns a string representation of the keyboard shortcut displayed by the cell.
     */
    private get _keyboardShortcutRepresentation(): string {
        if (!this._keyboardShortcut) return '';

        let representation: string = '';
        const code = this._keyboardShortcut.keyCode || '';

        if (code.startsWith('Key')) {
            // Alphanumeric keys can be extracted from the key code
            representation = code.substring(3);
        }
        else if (code.startsWith('Digit')) {
            // Digit keys can also be extracted from the key code
            representation = code.substring(5);
        }
        else {
            // Otherwise use the character code map, defaulting to showing the code otherwise
            representation = BMKeyboardShortcutCharacterMap[code] || code;
        }

        const isAppleSystem = (navigator.platform.startsWith('Mac') || /iPhone|iPad|iPod/.test(navigator.platform));

        // Add the modifier keys
        if (this._keyboardShortcut.modifiers.includes(BMKeyboardShortcutModifier.System)) {
            if (isAppleSystem) {
                representation = BMHTMLEntity.Command + representation;
            }
            else {
                representation = 'Ctrl + ' + representation;
            }
        }

        if (this._keyboardShortcut.modifiers.includes(BMKeyboardShortcutModifier.Command)) {
            if (isAppleSystem) {
                representation = BMHTMLEntity.Command + representation;
            }
            else {
                representation = 'Win + ' + representation;
            }
        }

        if (this._keyboardShortcut.modifiers.includes(BMKeyboardShortcutModifier.Shift)) {
            if (isAppleSystem) {
                representation = BMHTMLEntity.Shift + representation;
            }
            else {
                representation = 'Shift + ' + representation;
            }
        }
        
        if (this._keyboardShortcut.modifiers.includes(BMKeyboardShortcutModifier.Option)) {
            if (isAppleSystem) {
                representation = BMHTMLEntity.Option + representation;
            }
            else {
                representation = 'Alt + ' + representation;
            }
        }

        if (this._keyboardShortcut.modifiers.includes(BMKeyboardShortcutModifier.Control)) {
            if (isAppleSystem) {
                representation = BMHTMLEntity.Control + representation;
            }
            else {
                representation = 'Ctrl + ' + representation;
            }
        }

        if (!representation) {
            return 'Click to record';
        }

        return representation;
    }

    /**
     * Invoked when the keyboard shortcut view captures any keypress.
     * @param event         The keyboard event that triggered this action.
     */
    shortcutKeyPressedWithEvent(event: KeyboardEvent) {
        event.preventDefault();

        if (this._keyboardShortcut) {
            // NOTE: initializers should be invoked multiple times for any object, but is safe for keyboard shortcut
            this._keyboardShortcut.initWithKeyboardEvent(event, {
                target: this._keyboardShortcut.target, 
                action: this._keyboardShortcut.action, 
                preventsDefault: this._keyboardShortcut.preventsDefault
            });

            this._shortcutView.node.innerHTML = this._keyboardShortcutRepresentation;
        }
    }
}

/**
 * A class that provides the keyboard shortcut configuration UI for the keyboard shortcut controller.
 */
class BMKeyboardShortcutConfigurationWindow extends BMWindow implements BMCollectionViewDataSet<BMKeyboardShortcut>, BMCollectionViewDelegate, BMTextFieldDelegate {

    /**
     * The controller widget whose keyboard shortcut definitions are managed.
     */
    private widget!: BMKeyboardShortcutController;

    /**
     * The keyboard shortcuts currently defined.
     */
    keyboardShortcuts!: BMNamedKeyboardShortcut[];

    /**
     * During a data update, this contains a copy of the keyboard shortcuts prior to being modified.
     */
    private _oldKeyboardShortcuts?: BMNamedKeyboardShortcut[];

    /**
     * During a data upadte, this contains the new data set.
     */
    private _newKeyboardShortcuts?: BMNamedKeyboardShortcut[];

    /**
     * An array that contains the available widget names.
     */
    private widgetNames!: string[];

    /**
     * Returns a JSON array string containing the keyboard shortcut definitions.
     */
    get serializedShortcuts(): string {
        return JSON.stringify(this.keyboardShortcuts.map(s => {
            const serializedShortcut = s.serializedKeyboardShortcutWithTargetID('self')
            serializedShortcut._name = s.name.replace(/\s+/g, '');
            return serializedShortcut;
        }));
    }
    

    /**
     * The collection view used to manage the keyboard shortcut list.
     */
    private shortcutCollection: BMCollectionView<BMKeyboardShortcut>;

    // @override - BMView
    initWithDOMNode(): never {
        throw new Error('The keyboard shortcut configuration window must be initialized using initForWidget.');
    }

    // @override - BMWindow
    initWithFrame(): never {
        throw new Error('The keyboard shortcut configuration window must be initialized using initForWidget.');
    }

    /**
     * Initializes this window with the given frame for the given widget.
     * @param frame     The frame to use.
     * @param args 
     * @returns 
     */
    initForWidget(widget: BMKeyboardShortcutController): BMKeyboardShortcutConfigurationWindow {
        const frame = BMRectMake(window.innerWidth / 2 - 400 | 0, window.innerHeight / 2 - 400 | 0, 800, 800);
        super.initWithFrame(frame, {toolbar: YES, modal: NO});

        this.widget = widget;
        
        try {
            this.keyboardShortcuts = JSON.parse(widget.getProperty('_KeyboardShortcutConfiguration')).map(k => {
                const shortcut = BMKeyboardShortcut.keyboardShortcutWithSerializedKeyboardShortcut(k, {targetID: () => this.widget}) as BMNamedKeyboardShortcut;
                shortcut.name = k._name;

                return shortcut;
            });
        }
        catch (e) {
            // This most likely a JSON formatting error, start over with an empty list
            console.error(e);
            this.keyboardShortcuts = [];
        }

        this.registerKeyboardShortcut(BMKeyboardShortcut.keyboardShortcutWithKeyCode('Escape', {
            modifiers: [], 
            target: this, 
            action: 'dismissAnimated',
            preventsDefault: YES
        }));
        this.registerKeyboardShortcut(BMKeyboardShortcut.keyboardShortcutWithKeyCode('Equal', {
            modifiers: [BMKeyboardShortcutModifier.System], 
            target: this, 
            action: 'addShortcut',
            preventsDefault: YES
        }));

        this.width.greaterThanOrEqualTo(740 as any).isActive = YES;

        // Determine the available widget names
		const rootWidget = widget.jqElement.closest('#mashup-root').data('widget');
		this.widgetNames = ['Document', rootWidget.getProperty('DisplayName')];
		
		let widgets = rootWidget.widgets.slice();
		while (widgets.length) {
			const widget = widgets.pop();
			this.widgetNames.push(widget.getProperty('DisplayName'));
			widgets = widgets.concat(widget.widgets);
		}

        // Set up the header view
        const headerView = BMView.view();
        headerView.node.classList.add('BMKeyboardShortcutWindowToolbar');
        this.contentView.addSubview(headerView);
        headerView.leading.equalTo(this.contentView.leading).isActive = YES;
        headerView.trailing.equalTo(this.contentView.trailing).isActive = YES;
        headerView.top.equalTo(this.contentView.top).isActive = YES;

        // Set up the close button
        const closeButton = document.createElement('div');
        closeButton.className = 'BMLayoutEditorToolbarButton BMLayoutEditorCloseButton';
        closeButton.innerHTML = '<i class="material-icons">&#xE5CD;</i>';

        closeButton.style.opacity = '1';
        closeButton.style.pointerEvents = 'all';

        closeButton.addEventListener('click', e => this.dismissAnimated(YES));
        this.toolbar.appendChild(closeButton);

        // Set up the title view
        const titleView = BMView.view();
        titleView.node.innerText = 'Configure Keyboard Shortcuts';
        titleView.node.classList.add('BMWindowTitle');
        this.contentView.addSubview(titleView);
        titleView.supportsAutomaticIntrinsicSize = YES;
        titleView.leading.equalTo(this.contentView.leading, {plus: 64}).isActive = YES;
        titleView.centerY.equalTo(this.contentView.top, {plus: 32}).isActive = YES;

        // Set up the target label
        const targetLabel = BMView.view();
        targetLabel.node.innerText = 'Target:';
        targetLabel.node.classList.add('BMLabel', 'BMSublabel');
        targetLabel.supportsAutomaticIntrinsicSize = YES;
        this.contentView.addSubview(targetLabel);
        targetLabel.leading.equalTo(this.contentView.leading, {plus: 32}).isActive = YES;
        targetLabel.top.equalTo(titleView.bottom, {plus: 24}).isActive = YES;

        // Set up the target box
        const targetField = BMTextField.textField();
        targetField.node.classList.add('BMLabel');
        targetField.node.classList.add('BMInput');
        this.contentView.addSubview(targetField);
        targetField.centerY.equalTo(targetLabel.centerY).isActive = YES;
        targetField.leading.equalTo(targetLabel.trailing, {plus: 8}).isActive = YES;
        targetField.width.equalTo(300 as any).isActive = YES;
        targetField.height.equalTo(32 as any).isActive = YES;
        targetField.delegate = this;

        if (widget.getProperty('Target') == 'Document') {
            (targetField.node as HTMLInputElement).value = 'Document';
        }
        else {
            (targetField.node as HTMLInputElement).value = 'TargetWidget';
        }

        // Set up the add shortcut button
        const addShortcutButton = BMView.view();
        addShortcutButton.node.classList.add('BMButton');
        addShortcutButton.node.innerHTML = 'Add Shortcut';
        addShortcutButton.supportsAutomaticIntrinsicSize = YES;
        this.contentView.addSubview(addShortcutButton);
        addShortcutButton.centerY.equalTo(targetLabel.centerY).isActive = YES;
        addShortcutButton.trailing.equalTo(this.contentView.trailing, {plus: -32}).isActive = YES;

        addShortcutButton.node.addEventListener('click', e => this.addShortcut());

        headerView.bottom.equalTo(addShortcutButton.bottom, {plus: 16}).isActive = YES;

        // Set up the shortcut collection
        const shortcutCollection = BMCollectionView.collectionView();
        shortcutCollection.node.style.position = 'absolute';
        shortcutCollection.node.classList.add('BMKeyboardShortcutWindowContent')
        this.contentView.addSubview(shortcutCollection);
        shortcutCollection.top.equalTo(headerView.bottom).isActive = YES;
        shortcutCollection.leading.equalTo(this.contentView.leading).isActive = YES;
        shortcutCollection.trailing.equalTo(this.contentView.trailing).isActive = YES;
        shortcutCollection.bottom.equalTo(this.contentView.bottom).isActive = YES;

        shortcutCollection.registerCellClass(BMKeyboardShortcutCell, {forReuseIdentifier: 'KeyboardShortcut'});

        const layout = BMCollectionViewFlowLayout.flowLayout();
        layout.maximumCellsPerRow = 1;
        layout.gravity = BMCollectionViewFlowLayoutGravity.Expand;
        layout.rowSpacing = 0;
        layout.topPadding = 0;
        layout.bottomPadding = 0;
        layout.cellSize = BMSizeMake(1, 64);
        layout.contentGravity = BMCollectionViewFlowLayoutGravity.Start;
        shortcutCollection.layout = layout;

        shortcutCollection.supportsKeyboardNavigation = NO;
        shortcutCollection.dataSet = this;

        this.shortcutCollection = shortcutCollection;

        return this;
    }

    /**
     * Adds a new keyboard shortcut.
     */
    addShortcut() {
        this._oldKeyboardShortcuts = this.keyboardShortcuts.slice();
        this._newKeyboardShortcuts = this.keyboardShortcuts;

        this.keyboardShortcuts.unshift(BMKeyboardShortcut.keyboardShortcutWithKeyCode(undefined, {modifiers: [], target: this.widget, action: 'shortcutTriggeredWithEvent', preventsDefault: YES}));

        this.shortcutCollection.updateEntireDataAnimated();

        this._oldKeyboardShortcuts = undefined;
        this._newKeyboardShortcuts = undefined;
    }
    
    /**
     * Removes a keyboard shortcut.
     * @param shortcut      The shortcut to remove.
     */
    removeShortcut(shortcut: BMNamedKeyboardShortcut) {
        const index = this.keyboardShortcuts.findIndex(k => k == shortcut);
        if (index == -1) return;

        this._oldKeyboardShortcuts = this.keyboardShortcuts.slice();
        this._newKeyboardShortcuts = this.keyboardShortcuts;

        this.keyboardShortcuts.splice(index, 1);

        this.shortcutCollection.updateEntireDataAnimated();

        this._oldKeyboardShortcuts = undefined;
        this._newKeyboardShortcuts = undefined;
    }

    textFieldShouldAutocompleteText() {
        return YES;
    }

    textFieldShouldShowSuggestions() {
        return YES;
    }

    textFieldSuggestionsForText(textField, text): string[] {
        return this.widgetNames;
    }

    textFieldContentsDidChange(textField: BMTextField) {
        const text = (textField.node as HTMLInputElement).value;

        if (text == 'Document') {
            this.widget.setProperty('Target', text);
        }
        else {
            this.widget.setProperty('Target', 'Widget');
            this.widget.setProperty('TargetWidget', text);
        }
    }
    
    numberOfSections(): number {
        return 1;
    }

    numberOfObjectsInSectionAtIndex(index: number): number {
        return this.keyboardShortcuts.length;
    }

    indexPathForObjectAtRow(row: number, { inSectionAtIndex: section }: { inSectionAtIndex: number; }): BMIndexPath<BMKeyboardShortcut> {
        return BMIndexPathMakeWithRow(row, {section, forObject: this.keyboardShortcuts[row]});
    }

    indexPathForObject(object: any): BMIndexPath<BMKeyboardShortcut> {
        const index = this.keyboardShortcuts.findIndex(v => v == object);

        if (index == -1) {
            return undefined;
        }

        return BMIndexPathMakeWithRow(index, {section: 0, forObject: object});
    }
    
    cellForItemAtIndexPath(indexPath: BMIndexPath<BMKeyboardShortcut>): BMCollectionViewCell {
        const cell = this.shortcutCollection.dequeueCellForReuseIdentifier('KeyboardShortcut') as BMKeyboardShortcutCell;
        cell.keyboardShortcut = indexPath.object;
        cell.configurationWindow = this;

        return cell;
    }

    cellForSupplementaryViewWithIdentifier(identifier: string, { atIndexPath: atIndexPath }: { atIndexPath: BMIndexPath<any>; }): BMCollectionViewCell {
        // Supplementary views are not used
        throw new Error('Method not implemented.');
    }
    
    useOldData(use: boolean): void {
        if (use) {
            this.keyboardShortcuts = this._oldKeyboardShortcuts;
        }
        else {
            this.keyboardShortcuts = this._newKeyboardShortcuts;
        }
    }

    isUsingOldData(): boolean {
        return this.keyboardShortcuts == this._oldKeyboardShortcuts;
    }

    collectionViewCanSelectCellAtIndexPath() {
        return NO;
    }

    collectionViewCanHighlightCellAtIndexPath() {
        return NO;
    }
}

/**
 * The keyboard shortcut controller widget is a controller widget that can be used to add keyboard shortcuts to widgets
 * or the entire document.
 */
@TWWidgetDefinition('Keyboard Shortcut Controller')
export class BMKeyboardShortcutController extends TWComposerWidget implements BMWindowDelegate {

    /**
     * Set to `YES` after properties have been initialized.
     */
    private propertiesInitialized = NO;

    widgetIconUrl(): string {
        return require('./images/keyboardShortcutControllerIcon.png').default;
    }

    renderHtml(): string {
        return '<div class="widget-content BMCodeHost">\
            <div class="BMCodeHostContainer">\
                <div class="BMKeyboardShortcutControllerIcon"></div>\
                <div class="InlineBlock BMCHScriptEdit" >KeyboardShortcutController</div>\
            </div>\
        </div>';
    }

    afterRender(): void {
        this.jqElement.find('.BMCHScriptEdit')[0].addEventListener('click', e => this.configureKeyboardShortcuts());
    }

    widgetProperties(): TWWidgetProperties {
        require("./styles/ide.css");
        let properties: TWWidgetProperties = {
            name: 'Keyboard Shortcut Controller',
            description: 'Allows specifying keyboard shortcuts on specific widgets or the entire document.',
            category: ['Common'],
            supportsAutoResize: NO,
            isContainer: NO,
            isDraggable: YES,
            customEditorMenuText: 'Configure Keyboard Shortcuts',
            customEditor: 'BMKeyboardShortcutController',
            properties: {
                Width: {
                    description: 'Total width of the widget',
                    baseType: 'NUMBER',
                    isVisible: YES,
                    defaultValue: 192,
                    isBindingTarget: NO
                },
                Height: {
                    description: 'Total height of the widget',
                    baseType: 'NUMBER',
                    isVisible: YES,
                    defaultValue: 48,
                    isBindingTarget: NO
                },
                Target: {
                    baseType: 'STRING',
                    description: 'Controls where the keyboard shortcuts are installed.',
                    selectOptions: [
                        {text: 'Document', value: 'Document'},
                        {text: 'Widget', value: 'Widget'},
                    ],
                    defaultValue: 'Document',
                    isVisible: NO
                },
                TargetWidget: {
                    baseType: 'STRING',
                    description: 'If the "Target" is set to "Widget" this is the display name of the widget that should recognize keyboard shortcuts.',
                    defaultValue: '',
                    isVisible: NO
                },
                // Contains the keyboard shortcuts configuration
                _KeyboardShortcutConfiguration: {
                    baseType: 'STRING',
                    isVisible: NO,
                    defaultValue: '[]'
                }
            }
        };

        if (EXTENSION_MODE) {
            (<any>properties).isVisible = NO;
        }

        return properties;
    }

    /**
     * The currently open configuration window.
     */
    configurationWindow?: BMKeyboardShortcutConfigurationWindow;

    configureKeyboardShortcuts() {
        if (this.configurationWindow) {
            return this.configurationWindow.becomeKeyWindow();
        }

        const window = (new BMKeyboardShortcutConfigurationWindow).initForWidget(this);

        window.delegate = this;
        window.anchorNode = this.jqElement[0];
        window.bringToFrontAnimated();

        this.configurationWindow = window;
    }

    afterLoad() {
        try {
            const shortcuts = JSON.parse(this.getProperty('_KeyboardShortcutConfiguration', [])).map(k => {
                const shortcut = BMKeyboardShortcut.keyboardShortcutWithSerializedKeyboardShortcut(k, {targetID: () => this}) as BMNamedKeyboardShortcut;
                shortcut.name = k._name;

                return shortcut;
            });
            this.updateEventsWithShortcutList(shortcuts);
        }
        catch (e) {
            // Likely a badly formatted JSON, log and ignore
            console.error(e);
        }
    }

    windowWillClose(window: BMKeyboardShortcutConfigurationWindow) {
        const shortcuts = window.serializedShortcuts;
        this.updateEventsWithShortcutList(window.keyboardShortcuts);

        this.setProperty('_KeyboardShortcutConfiguration', shortcuts);

        this.configurationWindow = undefined;
    }

    widgetEvents(): Dictionary<TWWidgetEvent> {
        const events: Dictionary<TWWidgetEvent> = {};

        if (!this.propertiesInitialized) return events;

        const properties = this.allWidgetProperties().properties;
        Object.values(properties).forEach(p => {
            if (p.type == 'event') {
                events[p.name] = {description: p.description};
            }
        });

        return events;
    }

    widgetServices(): Dictionary<TWWidgetService> {
        return {
            AcquireFocus: {description: 'Causes the widget receiving keyboard shortcuts to acquire keyboard focus.'},
            ResignFocus: {description: 'Causes the widget receiving keyboard shortcuts to resign keyboard focus.'}
        };
    }

    updateEventsWithShortcutList(shortcuts: BMNamedKeyboardShortcut[]) {
        const allProperties = this.allWidgetProperties().properties;
        const properties = allProperties as typeof allProperties & Dictionary<{isBaseProperty?: boolean}>

        // Clear out all non-base properties
        for (const property in properties) {
            if (properties[property].type == 'event' && property.startsWith('Shortcut:')) {
                delete properties[property];
            }
        }

        // Then rebuild using the list of defined shortcuts
        for (const shortcut of shortcuts) {
            properties['Shortcut:' + shortcut.name] = {
                isBaseProperty: false,
                isVisible: true,
                name: 'Shortcut:' + shortcut.name,
                type: 'event',
                description: `Triggered when the ${shortcut.name} shortcut is detected.`,
                baseType: undefined as any
            };
        }

		// Inform the platform that properties were changed and it should update the property table
		// TODO: Determine which of these two calls is actually needed
		(this.updatedProperties as any)({updateUi: true});
		if (this.jqElement) {
			this.updateProperties();
		}

        this.propertiesInitialized = YES;

    }

    beforeDestroy() {

    }

}