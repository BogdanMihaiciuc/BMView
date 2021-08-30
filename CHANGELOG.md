# 2.6.11

Improved support for Thingworx 9.1.

Preliminary work towards editing widget properties directly in the layout editor. This capability is currently disabled in this version. A `USE_WIDGET_PROPERTIES` constant can be used to build this extension with this capability enabled.

# 2.6.7

Resolves an issue that could prevent the list of widgets from loading correctly in Thingworx 9.1.

Resolves an issue that caused to configure button to not work.

Resolves an issue that could cause widgets to have improper positions or sizes in the editor.

# 2.6

Support for Thingworx 9.

Support for Core UI 2.6 and the new layout editor.

# 2.6.0 Beta 8

Support for Thingworx 9.

# 2.6.0

Support for Core UI 2.6.

# 2.5.2

Resolved an issue that caused constraints created by old versions of the extension to not be loaded.

# 2.5.1

Resolved an issue that caused bindings to constraint constants to fail in certain cases at runtime.

# 2.5

View is now compatible with Thingworx 8.4.

It is now possible to control the constants of constraints via bindings. To do this, enable the `Bindable` property of constraints within the layout editor. To make recognizing bindable constraints easier, it is now also possible to customize the identifier of layout constraints via the `Identifier` setting.

View widget now supports binding to constants for active size class variations. Whenever a constant variation is introduced for a bindable constraint, a matching bindable field is created for that variation.

Resolved an issue that caused view positioning to be slightly off in the mashup builder after the layout editor was closed.

Resolved an issue when binding to `RightToLeftLayout` that caused the view hierarchy to have an incorrect layout after the initial layout pass.

Resolved an issue that caused a view hierarchy to have an incorrect layout if it started out hidden and was subsequently made visible.

Resolved an issue that caused the view hierarchy to momentarily appear in incorrect positions while the mashup was loading.

`ExtendedButton` is now marked as supporting automatic intrinsic size.

Resolved an issue that caused view to appear in incorrect positions during design-time.

View will now correctly invoke the `resize()` method of non-view based widgets when their bounds change.

Resolved an issue that caused view to not be destroyed correctly at run-time.

View will now set the `debuggingName` property to the `DisplayName` property of the widget.

Resolved an issue that caused a small window to quickly flash when bringing up the layout editor.

Resolved a low framerate issue when bringing up the layout editor.

Improved the fidelity of the animation that runs when closing the layout editor.

Resolved an issue that could cause an incorrect intrinsic size calculations of view widgets.

## Label View

A new `Label View` widget is now available, based on the `BMAttributedLabelView` class. It allows creating label templates with arguments. The label view supports setting a style, box shadow and border radius for itself, like other view based widgets as well as a localizable template.

Additionally, it creates a bindable field for each argument discovered in its template string that allows modifying that portion of the template. It also creates a style, border radius, box shadow, padding, margin and renderer with state formatting property for each argument, allowing a high degree of customization for both the label view itself as well as each individual argument.