using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Drawing;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Data.OleDb;

namespace TheCottageSkyBar
{
    public partial class AddItem : Form
    {
        public AddItem()
        {
            InitializeComponent();
        }

        private void AddItem_Load(object sender, EventArgs e)
        {
            loadItemType();
        }


        private void loadItemType()
        {
            comboBox1.Items.Clear();
            string strSQL = "SELECT ItemType.Name1 FROM ItemType;";
            OleDbConnection connection = new OleDbConnection(Form1.connStringMain);
            OleDbCommand command = new OleDbCommand(strSQL, connection);
            connection.Open();
            OleDbDataReader reader = command.ExecuteReader();
            while (reader.Read())
                comboBox1.Items.Add(reader["Name1"].ToString());

            reader.Close();
            connection.Close();
        }

        private void button2_Click(object sender, EventArgs e)
        {
            reset();
        }

        private void reset()
        {
            loadItemType();
            textBox1.Text = "1";
            comboBox2.SelectedIndex = 0;
            comboBox1.SelectedItem = "เลือกประเภทสินค้า";
            textBox2.Text = "";
            textBox3.Text = "";
            textBox4.Text = "";
            comboBox3.SelectedIndex = -1;
        }

        private void comboBox2_SelectedIndexChanged(object sender, EventArgs e)
        {
            if (comboBox2.SelectedIndex != 9)
                textBox1.Text = comboBox2.SelectedItem.ToString();
            else
            {
                textBox1.Text = "";
                this.ActiveControl = textBox1;
            }
        }

        private void button4_Click(object sender, EventArgs e)
        {
            textBox3.Text = "";
            this.ActiveControl = textBox3;
        }

        private void textBox3_KeyDown(object sender, KeyEventArgs e)
        {
            if (e.KeyCode == Keys.Enter)
            {
                if (checkDuplicateItem(textBox3.Text))
                    this.ActiveControl = textBox4;
                else
                {
                    MessageBox.Show("รหัสสินค้านี้มีการบันทึกไว้แล้ว");
                    textBox3.Text = "";
                    this.ActiveControl = textBox3;
                }

            }
        }

        private void button3_Click(object sender, EventArgs e)
        {
            this.Close();
        }

        private void button1_Click(object sender, EventArgs e)
        {
            if (validate())
            {
                if (insertItem())
                {
                    if (inserttoStock())
                    {
                        MessageBox.Show("บันทึกรายการสินค้าสำเร็จ");
                        reset();
                        comboBox1.SelectedIndex = -1;
                    }
                    else
                        MessageBox.Show("บันทึกรายการสินค้าสำเร็จ แต่บันทึกลง stock ไม่สำเร็จ");
                }
                else
                    MessageBox.Show("บันทึกรายการสินค้าไม่สำเร็จ");

            }
        }

        private bool insertItem()
        {
            string _itemTypeID = getItemTypeID(comboBox1.SelectedItem.ToString());
            int _success = 0;
            if (_itemTypeID != "0")
            {
                string strProvider = Form1.connStringMain;
               
                string strSQL = "INSERT INTO Items(ID,Name1,ItemTypeID,Date1,Owner,Price) VALUES('" + textBox3.Text + "','" + textBox2.Text + "'," + _itemTypeID + ",#" + DateTime.Now.ToShortDateString() + "#,'" + comboBox3.SelectedItem.ToString() + "'," + textBox4.Text + ");";
                OleDbConnection connection = new OleDbConnection(strProvider);
                connection.Open();
                OleDbCommand command = new OleDbCommand(strSQL, connection);
                _success = command.ExecuteNonQuery();
                connection.Close();
            }

            if (_success != 0)     
                    return true;
                else
                    return false;
        }

        private string getItemTypeID(string itemType)
        {
            comboBox1.Items.Clear();
            string _typeID = "0";
            string strSQL = "SELECT ItemType.ID FROM ItemType WHERE Name1='"+itemType+"';";
            OleDbConnection connection = new OleDbConnection(Form1.connStringMain);
            OleDbCommand command = new OleDbCommand(strSQL, connection);
            connection.Open();
            OleDbDataReader reader = command.ExecuteReader();
            while (reader.Read())
                _typeID = reader["ID"].ToString();

            reader.Close();
            connection.Close();
            if (_typeID == null)
                _typeID = "0";
            return _typeID;
        }

        private bool inserttoStock()
        {
            string _itemTypeID = (comboBox1.SelectedIndex + 1).ToString();
            string strProvider = Form1.connStringMain;
            int _success = 0;
            string strSQL = "INSERT INTO Stock(ItemID,Amount,Date1,Time1) VALUES(" + textBox3.Text + "," + textBox1.Text + ",#"+DateTime.Now.ToShortDateString()+"#,#"+DateTime.Now.ToShortTimeString()+"#)";
            OleDbConnection connection = new OleDbConnection(strProvider);
            connection.Open();
            OleDbCommand command = new OleDbCommand(strSQL, connection);
            _success = command.ExecuteNonQuery();
            connection.Close();

            if (_success != 0)
                return true;
            else
                return false;
        }

        private bool validate()
        {
            if (comboBox1.SelectedIndex<0)
            {
                MessageBox.Show("เลือกประเภทสินค้า");
                return false;
            }
            try
            {
                Convert.ToInt16(textBox1.Text);
            }
            catch (Exception)
            {
                MessageBox.Show("ใส่จำนวนสินค้าไม่ถูกต้อง");
                return false;
            }
            if (textBox2.Text=="")
            {
                MessageBox.Show("ใส่ชื่อสินค้า");
                return false;
            }

            try
            {
                Convert.ToInt64(textBox3.Text);
            }
            catch (Exception)
            {
                MessageBox.Show("ใส่รหัสสินค้าไม่ถูกต้อง");
                return false;
            }

            try
            {
                Convert.ToDouble(textBox4.Text);
            }
            catch (Exception)
            {
                MessageBox.Show("ใส่ราคาสินค้าไม่ถูกต้อง");
                return false;
            }
            if (comboBox3.SelectedIndex < 0)
            {
                MessageBox.Show("เลือกชื่อผู้บันทึก");
                return false;
            }
            return true;

        }

        private bool checkDuplicateItem(string itemID)
        {
            int _success = 0;
            string strSQL = "SELECT Count(ID) AS Amount from Items where ID='"+itemID+"';";
            OleDbConnection connection = new OleDbConnection(Form1.connStringMain);
            OleDbCommand command = new OleDbCommand(strSQL, connection);
            connection.Open();
            OleDbDataReader reader = command.ExecuteReader();
            while (reader.Read())
                _success = Convert.ToInt16(reader["Amount"].ToString());
            reader.Close();
            connection.Close();
            if (_success == 0)
            {
                return true;
            }
            else
                return false;
        }

        private void comboBox1_SelectedIndexChanged(object sender, EventArgs e)
        {

        }
    }
}
