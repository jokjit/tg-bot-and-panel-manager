<template>
  <n-config-provider
    :theme="naiveTheme"
    :theme-overrides="themeOverrides"
    :locale="naiveLocale"
    :date-locale="naiveDateLocale"
  >
    <n-message-provider>
      <n-dialog-provider>
        <router-view />
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup>
import { computed } from 'vue';
import {
  darkTheme,
  NConfigProvider,
  NDialogProvider,
  NMessageProvider,
  dateEnUS,
  dateZhCN,
  enUS,
  zhCN,
} from 'naive-ui';
import { uiStore } from './stores/ui';

const sharedCommon = {
  primaryColor: '#5c8bff',
  primaryColorHover: '#73a0ff',
  primaryColorPressed: '#4678f5',
  infoColor: '#5c8bff',
  successColor: '#40c9a2',
  warningColor: '#ffb65c',
  errorColor: '#ff7c66',
  borderRadius: '18px',
  borderRadiusSmall: '14px',
};

const lightThemeOverrides = {
  common: {
    ...sharedCommon,
    bodyColor: 'transparent',
    cardColor: 'rgba(255,255,255,0.78)',
    modalColor: '#ffffff',
    popoverColor: '#ffffff',
    tableColor: 'rgba(255,255,255,0.78)',
    borderColor: 'rgba(110, 136, 210, 0.22)',
    textColorBase: '#16203a',
    textColor1: '#16203a',
    textColor2: '#5a6a88',
    textColor3: '#8090ac',
    placeholderColor: '#8b97b1',
    inputColorDisabled: 'rgba(232, 237, 248, 0.9)',
  },
  Card: {
    color: 'rgba(255,255,255,0.76)',
    borderColor: 'rgba(110, 136, 210, 0.18)',
    titleTextColor: '#16203a',
    textColor: '#51617f',
  },
  Layout: {
    color: 'transparent',
    siderColor: 'transparent',
    headerColor: 'transparent',
    contentColor: 'transparent',
  },
  Input: {
    color: 'rgba(246, 248, 255, 0.95)',
    colorFocus: 'rgba(255, 255, 255, 0.98)',
    textColor: '#16203a',
    placeholderColor: '#8b97b1',
    border: '1px solid rgba(110, 136, 210, 0.2)',
    borderHover: '1px solid rgba(92, 139, 255, 0.45)',
    borderFocus: '1px solid rgba(92, 139, 255, 0.65)',
    boxShadowFocus: '0 0 0 3px rgba(92, 139, 255, 0.12)',
  },
  Select: {
    peers: {
      InternalSelection: {
        color: 'rgba(246, 248, 255, 0.95)',
        textColor: '#16203a',
        placeholderColor: '#8b97b1',
        border: '1px solid rgba(110, 136, 210, 0.2)',
        borderHover: '1px solid rgba(92, 139, 255, 0.45)',
        borderFocus: '1px solid rgba(92, 139, 255, 0.65)',
        boxShadowFocus: '0 0 0 3px rgba(92, 139, 255, 0.12)',
      },
      InternalSelectMenu: {
        color: '#ffffff',
      },
    },
  },
  Menu: {
    itemTextColor: '#566684',
    itemIconColor: '#7e8fb2',
    itemTextColorHover: '#16203a',
    itemTextColorActive: '#3158d8',
    itemTextColorActiveHover: '#3158d8',
    itemIconColorActive: '#3158d8',
    itemIconColorActiveHover: '#3158d8',
    itemColorHover: 'rgba(92, 139, 255, 0.08)',
    itemColorActive: 'rgba(92, 139, 255, 0.12)',
    itemColorActiveHover: 'rgba(92, 139, 255, 0.14)',
  },
  Button: {
    borderRadiusSmall: '14px',
  },
};

const darkThemeOverrides = {
  common: {
    ...sharedCommon,
    bodyColor: 'transparent',
    cardColor: 'rgba(15, 22, 40, 0.86)',
    modalColor: 'rgba(15, 22, 40, 0.96)',
    popoverColor: 'rgba(15, 22, 40, 0.98)',
    tableColor: 'rgba(15, 22, 40, 0.86)',
    borderColor: 'rgba(104, 131, 221, 0.22)',
    textColorBase: '#f5f7ff',
    textColor1: '#f5f7ff',
    textColor2: '#b8c6e3',
    textColor3: '#7f90b1',
    placeholderColor: '#7282a3',
    inputColorDisabled: 'rgba(12, 18, 32, 0.7)',
  },
  Card: {
    color: 'rgba(15, 22, 40, 0.84)',
    borderColor: 'rgba(104, 131, 221, 0.18)',
    titleTextColor: '#f5f7ff',
    textColor: '#b8c6e3',
  },
  Layout: {
    color: 'transparent',
    siderColor: 'transparent',
    headerColor: 'transparent',
    contentColor: 'transparent',
  },
  Input: {
    color: 'rgba(10, 16, 30, 0.88)',
    colorFocus: 'rgba(12, 18, 34, 0.98)',
    textColor: '#f5f7ff',
    placeholderColor: '#7282a3',
    border: '1px solid rgba(104, 131, 221, 0.22)',
    borderHover: '1px solid rgba(92, 139, 255, 0.48)',
    borderFocus: '1px solid rgba(92, 139, 255, 0.72)',
    boxShadowFocus: '0 0 0 3px rgba(92, 139, 255, 0.16)',
  },
  Select: {
    peers: {
      InternalSelection: {
        color: 'rgba(10, 16, 30, 0.88)',
        textColor: '#f5f7ff',
        placeholderColor: '#7282a3',
        border: '1px solid rgba(104, 131, 221, 0.22)',
        borderHover: '1px solid rgba(92, 139, 255, 0.48)',
        borderFocus: '1px solid rgba(92, 139, 255, 0.72)',
        boxShadowFocus: '0 0 0 3px rgba(92, 139, 255, 0.16)',
      },
      InternalSelectMenu: {
        color: 'rgba(15, 22, 40, 0.98)',
      },
    },
  },
  Menu: {
    itemTextColor: '#b8c6e3',
    itemIconColor: '#8ea2d4',
    itemTextColorHover: '#ffffff',
    itemTextColorActive: '#ffffff',
    itemTextColorActiveHover: '#ffffff',
    itemIconColorActive: '#ffffff',
    itemIconColorActiveHover: '#ffffff',
    itemColorHover: 'rgba(92, 139, 255, 0.12)',
    itemColorActive: 'rgba(92, 139, 255, 0.2)',
    itemColorActiveHover: 'rgba(92, 139, 255, 0.24)',
  },
  Button: {
    borderRadiusSmall: '14px',
  },
};

const themeOverrides = computed(() => (uiStore.theme === 'dark' ? darkThemeOverrides : lightThemeOverrides));
const naiveTheme = computed(() => (uiStore.theme === 'dark' ? darkTheme : null));
const naiveLocale = computed(() => (uiStore.locale === 'en-US' ? enUS : zhCN));
const naiveDateLocale = computed(() => (uiStore.locale === 'en-US' ? dateEnUS : dateZhCN));
</script>
