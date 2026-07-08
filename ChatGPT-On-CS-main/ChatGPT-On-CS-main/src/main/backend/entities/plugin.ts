import { DataTypes, Model, Sequelize } from 'sequelize';

export class Plugin extends Model {
  declare id: number;

  declare code: string;

  declare created_at: Date;

  declare version: string;

  declare source: string; // 自定义插件、官方内置插件、第三方插件

  declare author: string; // 插件作者

  declare description: string; // 插件描述

  declare icon: string; // 插件图标

  declare tags: string; // 插件标签

  declare type: string; // 插件类型

  declare title: string; // 插件标题
}

export async function checkAndAddFields(sequelize: Sequelize) {
  const tableDescription = (await Plugin.describe()) as Record<string, unknown>;

  if (!tableDescription.source) {
    await sequelize.getQueryInterface().addColumn('plugins', 'source', {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: 'custom',
    });
  }

  if (!tableDescription.author) {
    await sequelize.getQueryInterface().addColumn('plugins', 'author', {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: 'unknown',
    });
  }

  if (!tableDescription.description) {
    await sequelize.getQueryInterface().addColumn('plugins', 'description', {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: '插件的描述信息~',
    });
  }

  if (!tableDescription.icon) {
    await sequelize.getQueryInterface().addColumn('plugins', 'icon', {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: '😀',
    });
  }

  if (!tableDescription.tags) {
    await sequelize.getQueryInterface().addColumn('plugins', 'tags', {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: JSON.stringify([]),
    });
  }

  if (!tableDescription.type) {
    await sequelize.getQueryInterface().addColumn('plugins', 'type', {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: 'plugin',
    });
  }

  if (!tableDescription.title) {
    await sequelize.getQueryInterface().addColumn('plugins', 'title', {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: '插件标题',
    });
  }

  // 再更新字段的默认版本号
  await sequelize.getQueryInterface().changeColumn('plugins', 'version', {
    type: DataTypes.STRING(255),
    defaultValue: '1.4.5',
    allowNull: true,
  });
}

export function initPlugin(sequelize: Sequelize) {
  Plugin.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      code: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      // @Deprecated
      platform: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      // @Deprecated
      platform_id: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      // @Deprecated
      instance_id: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      version: {
        type: DataTypes.STRING(255),
        defaultValue: '1.4.5',
        allowNull: true,
      },
      source: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: 'custom',
      },
      author: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: 'unknown',
      },
      description: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: '插件的描述信息~',
      },
      icon: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: '😀',
      },
      tags: {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: JSON.stringify([]),
      },
      type: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: 'plugin',
      },
      title: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: '插件标题',
      },
    },
    {
      sequelize,
      modelName: 'Plugin',
      tableName: 'plugins',
      timestamps: false,
    },
  );

  // checkAndAddFields 必须在 sequelize.sync() 之后调用，由 ormconfig.ts 负责调用
}
