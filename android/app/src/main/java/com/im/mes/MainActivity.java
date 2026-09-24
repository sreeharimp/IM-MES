package com.im.mes;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PrinterPlugin.class);
        super.onCreate(savedInstanceState);
        getWindow().setBackgroundDrawable(null);
        if (getBridge() != null && getBridge().getWebView() != null) {
            // Software layer is required so the WebView can composite
            // with true per-pixel transparency over the native camera surface.
            getBridge().getWebView().setLayerType(View.LAYER_TYPE_SOFTWARE, null);
            getBridge().getWebView().setBackgroundColor(Color.TRANSPARENT);
        }
    }
}
